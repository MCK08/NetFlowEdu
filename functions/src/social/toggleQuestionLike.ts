import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import { buildLikeId } from "./likeId";
import { canReadQuestion } from "./questionAccess";
import {
  commitNotification,
  commitNotificationDeletion,
  prepareNotification,
  prepareNotificationDeletion,
  resolveQuestionEventRecipient,
} from "../notifications";

interface ToggleQuestionLikeRequest {
  questionId: string;
  /** Phase 91 — the state the caller WANTS to end in.
   *
   *  WHY THIS EXISTS
   *
   *  Without it this callable is a pure toggle, and a toggle's result depends
   *  on how many times it is called rather than on what the user meant. Phase
   *  91 proved both consequences against the emulator: a client that retries
   *  after a lost response flips the like back off, and two devices tapping
   *  "like" for the same user can land on NOT liked. The deterministic document
   *  id already prevented duplicate likes and counter drift — it could not
   *  prevent inversion, because inversion is what a toggle is.
   *
   *  With a desired state, the same request sent twice produces the same
   *  answer, which is what makes a retry safe.
   *
   *  Optional on purpose: omitting it keeps the original toggle behaviour, so a
   *  client build that predates this field keeps working unchanged. */
  liked?: boolean;
}

interface ToggleQuestionLikeResult {
  liked: boolean;
  likeCount: number;
}

// Explicit region to match every other function in this project (see
// `firebase functions:list` — all us-central1).
export const toggleQuestionLike = onCall<ToggleQuestionLikeRequest>(
  { region: "us-central1" },
  async (request): Promise<ToggleQuestionLikeResult> => {
    const caller = request.auth;
    if (!caller) {
      throw new HttpsError("unauthenticated", "Bu işlem için giriş yapmanız gerekiyor.");
    }

    const questionId = request.data?.questionId;
    if (typeof questionId !== "string" || questionId.length === 0) {
      throw new HttpsError("invalid-argument", "Geçersiz soru kimliği.");
    }

    const db = getFirestore();
    const questionRef = db.collection("questions").doc(questionId);
    const likeRef = db.collection("questionLikes").doc(buildLikeId(questionId, caller.uid));

    return db.runTransaction(async (tx) => {
      const [questionSnap, likeSnap] = await Promise.all([tx.get(questionRef), tx.get(likeRef)]);

      if (!questionSnap.exists) {
        throw new HttpsError("not-found", "Soru bulunamadı.");
      }
      const question = questionSnap.data() ?? {};

      let isMember = false;
      if (question.visibility === "class" && typeof question.classId === "string") {
        const memberSnap = await tx.get(
          db.collection("classes").doc(question.classId).collection("members").doc(caller.uid),
        );
        isMember = memberSnap.exists;
      }
      if (!canReadQuestion(question, caller.uid, isMember)) {
        throw new HttpsError("permission-denied", "Bu soruya erişim izniniz yok.");
      }

      const alreadyLiked = likeSnap.exists;
      const currentCount = typeof question.likeCount === "number" ? question.likeCount : 0;

      // A desired state that already holds is a no-op, not a flip — and
      // deliberately not an error either: a retry succeeded the first time, so
      // reporting failure on the second would be a lie the client would have to
      // undo. It returns the state the caller asked for, which is also the
      // state that is stored.
      const desired = request.data?.liked;
      if (typeof desired === "boolean" && desired === alreadyLiked) {
        return { liked: alreadyLiked, likeCount: currentCount };
      }

      if (alreadyLiked) {
        // ---- READ PHASE (every read must precede every write) ----
        const deletionPlan =
          typeof question.ownerId === "string"
            ? await prepareNotificationDeletion(tx, db, {
                recipientId: question.ownerId,
                actorId: caller.uid,
                type: "question_liked",
                entityId: questionId,
              })
            : null;

        // ---- WRITE PHASE ----
        tx.delete(likeRef);
        tx.update(questionRef, { likeCount: Math.max(0, currentCount - 1) });
        commitNotificationDeletion(tx, deletionPlan);
        return { liked: false, likeCount: Math.max(0, currentCount - 1) };
      }

      // ---- READ PHASE (every read must precede every write) ----
      const recipientId =
        typeof question.ownerId === "string"
          ? resolveQuestionEventRecipient(
              { ownerId: question.ownerId, posterRole: question.posterRole },
              caller.uid,
            )
          : null;
      const notificationPlan = recipientId
        ? await prepareNotification(tx, db, {
            recipientId,
            actorId: caller.uid,
            type: "question_liked",
            entityType: "question",
            entityId: questionId,
          })
        : null;

      // ---- WRITE PHASE ----
      tx.set(likeRef, {
        userId: caller.uid,
        targetId: questionId,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.update(questionRef, { likeCount: currentCount + 1 });
      commitNotification(tx, notificationPlan);
      return { liked: true, likeCount: currentCount + 1 };
    });
  },
);
