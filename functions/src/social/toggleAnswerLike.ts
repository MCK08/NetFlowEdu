import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import { buildLikeId } from "./likeId";
import { canReadQuestion } from "./questionAccess";
import {
  commitNotification,
  commitNotificationDeletion,
  prepareNotification,
  prepareNotificationDeletion,
  resolveAnswerEventRecipient,
} from "../notifications";

interface ToggleAnswerLikeRequest {
  answerId: string;
  /** Phase 92 — the state the caller WANTS to end in.
   *
   *  Phase 91 gave question likes this field after proving a plain toggle's
   *  result depends on how many times it is called rather than on what the user
   *  meant, and named this callable as carrying the identical defect. Phase 92
   *  reproduced it here before changing anything: a retried LIKE returned
   *  `true` then `false` and dropped the count back to 0, two devices both
   *  meaning "like" settled on NOT liked, a retried UNLIKE re-liked, and the
   *  answer owner's like notification was created by the first call and
   *  DELETED by the retry.
   *
   *  The deterministic document id already prevented duplicate likes and count
   *  drift. It could not prevent inversion, because inversion is what a toggle
   *  is.
   *
   *  Optional on purpose: omitting it keeps the original toggle behaviour, so a
   *  client build that predates this field keeps working unchanged. */
  liked?: boolean;
}

interface ToggleAnswerLikeResult {
  liked: boolean;
  likeCount: number;
}

export const toggleAnswerLike = onCall<ToggleAnswerLikeRequest>(
  { region: "us-central1" },
  async (request): Promise<ToggleAnswerLikeResult> => {
    const caller = request.auth;
    if (!caller) {
      throw new HttpsError("unauthenticated", "Bu işlem için giriş yapmanız gerekiyor.");
    }

    const answerId = request.data?.answerId;
    if (typeof answerId !== "string" || answerId.length === 0) {
      throw new HttpsError("invalid-argument", "Geçersiz cevap kimliği.");
    }

    const db = getFirestore();
    const answerRef = db.collection("answers").doc(answerId);
    const likeRef = db.collection("answerLikes").doc(buildLikeId(answerId, caller.uid));

    return db.runTransaction(async (tx) => {
      const answerSnap = await tx.get(answerRef);
      if (!answerSnap.exists) {
        throw new HttpsError("not-found", "Cevap bulunamadı.");
      }
      const answer = answerSnap.data() ?? {};

      const questionId = answer.questionId;
      if (typeof questionId !== "string") {
        throw new HttpsError("failed-precondition", "Cevap geçerli bir soruya bağlı değil.");
      }
      const questionSnap = await tx.get(db.collection("questions").doc(questionId));
      const question = questionSnap.data() ?? {};

      let isMember = false;
      if (questionSnap.exists && question.visibility === "class" && typeof question.classId === "string") {
        const memberSnap = await tx.get(
          db.collection("classes").doc(question.classId).collection("members").doc(caller.uid),
        );
        isMember = memberSnap.exists;
      }
      if (!questionSnap.exists || !canReadQuestion(question, caller.uid, isMember)) {
        throw new HttpsError("permission-denied", "Bu cevaba erişim izniniz yok.");
      }

      const likeSnap = await tx.get(likeRef);
      const alreadyLiked = likeSnap.exists;
      const currentCount = typeof answer.likeCount === "number" ? answer.likeCount : 0;

      // A desired state that already holds is a no-op, not a flip — and not an
      // error either: the first call succeeded, so reporting failure on the
      // retry would be a lie the client would have to undo. Returning here also
      // means the no-op never reaches the owner-role read or the notification
      // planning below, so a retry writes nothing and notifies nobody.
      const desired = request.data?.liked;
      if (typeof desired === "boolean" && desired === alreadyLiked) {
        return { liked: alreadyLiked, likeCount: currentCount };
      }

      if (alreadyLiked) {
        // ---- READ PHASE (every read must precede every write) ----
        const deletionPlan =
          typeof answer.ownerId === "string"
            ? await prepareNotificationDeletion(tx, db, {
                recipientId: answer.ownerId,
                actorId: caller.uid,
                type: "answer_liked",
                entityId: answerId,
              })
            : null;

        // ---- WRITE PHASE ----
        tx.delete(likeRef);
        tx.update(answerRef, { likeCount: Math.max(0, currentCount - 1) });
        commitNotificationDeletion(tx, deletionPlan);
        return { liked: false, likeCount: Math.max(0, currentCount - 1) };
      }

      // ---- READ PHASE (every read must precede every write) ----
      let notificationPlan = null;
      if (typeof answer.ownerId === "string") {
        // The answer owner's OWN account role — no shipped route lets a
        // teacher account own an answer today, but this is read rather
        // than assumed, so the guard holds if that ever changes. See
        // resolveAnswerEventRecipient's own doc comment.
        const ownerSnap = await tx.get(db.collection("users").doc(answer.ownerId));
        const ownerRole = ownerSnap.data()?.role;
        const recipientId = resolveAnswerEventRecipient(
          { ownerId: answer.ownerId, ownerRole },
          caller.uid,
        );
        if (recipientId) {
          notificationPlan = await prepareNotification(tx, db, {
            recipientId,
            actorId: caller.uid,
            type: "answer_liked",
            entityType: "answer",
            entityId: answerId,
            parentEntityId: questionId,
          });
        }
      }

      // ---- WRITE PHASE ----
      tx.set(likeRef, {
        userId: caller.uid,
        targetId: answerId,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.update(answerRef, { likeCount: currentCount + 1 });
      commitNotification(tx, notificationPlan);
      return { liked: true, likeCount: currentCount + 1 };
    });
  },
);
