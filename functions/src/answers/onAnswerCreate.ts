import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

// Maintains questions/{questionId}.answerCount server-side so the feed can
// display a count without trusting a client-writable field (firestore.rules
// blocks any client write to answerCount — see the questions/{questionId}
// update rule). The Question Detail screen doesn't use this at all; it
// shows the live length of its own answers listener instead.
//
// Known limitation: Cloud Functions triggers are delivered at-least-once,
// so a retried delivery could in principle increment twice for the same
// answer. A fully exactly-once counter would need a transactional dedup
// marker; that's more complexity than an MVP display count justifies, so
// this is the plain increment version. Acceptable because: (a) retries are
// rare, (b) this count is informational only — nothing security-sensitive
// or scoring-related reads it, and (c) it can be reconciled later by
// recomputing from the answers collection if it ever drifts.
export const onAnswerCreate = onDocumentCreated("answers/{answerId}", async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;

  const questionId = snapshot.data().questionId;
  if (typeof questionId !== "string" || questionId.length === 0) {
    logger.warn(`answers/${event.params.answerId} has no valid questionId, skipping count update`);
    return;
  }

  const db = getFirestore();
  const questionRef = db.collection("questions").doc(questionId);

  try {
    await questionRef.update({ answerCount: FieldValue.increment(1) });
  } catch (error) {
    // Most likely cause: the question was deleted between answer creation
    // and this trigger running. Don't fail the function for a missing
    // parent — there's nothing left to count for.
    logger.warn(`Could not increment answerCount for questions/${questionId}`, { error });
  }
});
