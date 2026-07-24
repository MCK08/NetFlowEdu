// Mirrors firestore.rules' canReadQuestionData — Cloud Functions run with
// the Admin SDK, which bypasses security rules entirely, so any function
// that reads/writes based on "can this caller see this question" has to
// reimplement the same authorization check itself. Keep both in sync if
// question visibility rules ever change.
//
// 'class' visibility can't be resolved from the question doc alone — it
// needs a class-membership lookup (a Firestore read against
// classes/{classId}/members/{callerUid}). Callers resolve that themselves
// (see toggleQuestionLike.ts/toggleAnswerLike.ts, which do it inside their
// own transaction) and pass the result in, rather than this function doing
// a surprise extra read of its own.
export function canReadQuestion(
  question: Record<string, unknown>,
  callerUid: string,
  isClassMember = false,
): boolean {
  if (question.visibility === "private") return question.ownerId === callerUid;
  if (question.visibility === "public") return true;
  if (question.visibility === "class") return question.ownerId === callerUid || isClassMember;
  return false;
}
