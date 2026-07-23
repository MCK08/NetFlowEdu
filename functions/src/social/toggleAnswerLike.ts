import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import { buildLikeId } from "./likeId";
import { canReadQuestion } from "./questionAccess";

interface ToggleAnswerLikeRequest {
  answerId: string;
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
      if (!questionSnap.exists || !canReadQuestion(questionSnap.data() ?? {}, caller.uid)) {
        throw new HttpsError("permission-denied", "Bu cevaba erişim izniniz yok.");
      }

      const likeSnap = await tx.get(likeRef);
      const alreadyLiked = likeSnap.exists;
      const currentCount = typeof answer.likeCount === "number" ? answer.likeCount : 0;

      if (alreadyLiked) {
        tx.delete(likeRef);
        tx.update(answerRef, { likeCount: Math.max(0, currentCount - 1) });
        return { liked: false, likeCount: Math.max(0, currentCount - 1) };
      }

      tx.set(likeRef, {
        userId: caller.uid,
        targetId: answerId,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.update(answerRef, { likeCount: currentCount + 1 });
      return { liked: true, likeCount: currentCount + 1 };
    });
  },
);
