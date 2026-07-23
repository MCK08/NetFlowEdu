// Mirrors firestore.rules' canReadQuestionData — Cloud Functions run with
// the Admin SDK, which bypasses security rules entirely, so any function
// that reads/writes based on "can this caller see this question" has to
// reimplement the same authorization check itself. Keep both in sync if
// question visibility rules ever change.
export function canReadQuestion(question: Record<string, unknown>, callerUid: string): boolean {
  if (question.visibility === "private") return question.ownerId === callerUid;
  if (question.visibility === "public") return true;
  if (question.visibility === "class") return question.ownerId === callerUid; // no roster check yet
  return false;
}
