import { onDocumentCreated, onDocumentDeleted } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

// Maintains questions/{questionId}.commentCount, mirroring the
// onAnswerCreate pattern (see functions/src/answers/onAnswerCreate.ts) —
// same at-least-once-delivery caveat applies (documented there and in
// SECURITY.md), acceptable for the same reason: an informational display
// count, not anything security- or scoring-sensitive.
export const onQuestionCommentCreate = onDocumentCreated(
  { document: "questionComments/{commentId}", region: "us-central1" },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const questionId = snapshot.data().questionId;
    if (typeof questionId !== "string" || questionId.length === 0) {
      logger.warn(`questionComments/${event.params.commentId} has no valid questionId`);
      return;
    }

    await getFirestore()
      .collection("questions")
      .doc(questionId)
      .update({ commentCount: FieldValue.increment(1) })
      .catch((error) => {
        logger.warn(`Could not increment commentCount for questions/${questionId}`, { error });
      });
  },
);

export const onQuestionCommentDelete = onDocumentDeleted(
  { document: "questionComments/{commentId}", region: "us-central1" },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const questionId = snapshot.data().questionId;
    if (typeof questionId !== "string" || questionId.length === 0) return;

    const questionRef = getFirestore().collection("questions").doc(questionId);

    // Decrement via a transaction (not a bare FieldValue.increment(-1))
    // specifically so it can be floored at 0 — increment(-1) alone could
    // in principle drive the count negative under a delivery race, which
    // FieldValue has no built-in clamp for.
    await getFirestore()
      .runTransaction(async (tx) => {
        const snap = await tx.get(questionRef);
        if (!snap.exists) return;
        const current = snap.data()?.commentCount;
        const next = Math.max(0, (typeof current === "number" ? current : 0) - 1);
        tx.update(questionRef, { commentCount: next });
      })
      .catch((error) => {
        logger.warn(`Could not decrement commentCount for questions/${questionId}`, { error });
      });
  },
);
