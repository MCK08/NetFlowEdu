import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import { buildLikeId } from "./likeId";
import { canReadQuestion } from "./questionAccess";

interface ToggleQuestionLikeRequest {
  questionId: string;
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
      if (!canReadQuestion(question, caller.uid)) {
        throw new HttpsError("permission-denied", "Bu soruya erişim izniniz yok.");
      }

      const alreadyLiked = likeSnap.exists;
      const currentCount = typeof question.likeCount === "number" ? question.likeCount : 0;

      if (alreadyLiked) {
        tx.delete(likeRef);
        tx.update(questionRef, { likeCount: Math.max(0, currentCount - 1) });
        return { liked: false, likeCount: Math.max(0, currentCount - 1) };
      }

      tx.set(likeRef, {
        userId: caller.uid,
        targetId: questionId,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.update(questionRef, { likeCount: currentCount + 1 });
      return { liked: true, likeCount: currentCount + 1 };
    });
  },
);
