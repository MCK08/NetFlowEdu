// Pure, framework-free decision logic shared by every question/answer
// notification source (toggleQuestionLike, toggleAnswerLike, the
// onAnswerCreate trigger, the onQuestionCommentCreate trigger) — extracted
// specifically so these decisions are directly unit-testable without a
// Firestore emulator or a firebase-functions-test harness (onDocumentCreated
// triggers don't expose a `.run()` the way onCall callables do). Each
// trigger/callable's own job is reduced to: read the data, call one of
// these, and if it returns a recipient, call createNotificationInTransaction
// — no decision logic left un-tested inside the trigger itself.
//
// Product decision (pre-commit hardening): there is no teacher-facing
// question-detail screen anywhere in this app today — QuestionDetailScreen's
// own "Cevapla" button hardcodes an absolute push into the STUDENT route
// group (`/(student)/answer/[questionId]`), so it is not actually
// role-agnostic and cannot safely be reused under a teacher route without a
// real feature change. Rather than create a notification a teacher could
// never open (a permanent, accumulating dead end in their unread count),
// these helpers refuse to produce a recipient for a teacher-owned question
// at all. See src/features/notifications/services/notificationNavigation.ts's
// "unavailable" branch for the client-side belt-and-suspenders in case any
// legacy/out-of-band data ever gets past this.

export interface QuestionOwnerInfo {
  ownerId: string;
  // Matches Question.posterRole ("teacher" | "student") when present.
  // Missing/undefined on documents created before this field existed
  // defaults, same as the client's own toQuestion(), to "teacher" — see
  // isTeacherOwnedQuestion below.
  posterRole?: string | null;
}

function isTeacherOwnedQuestion(question: QuestionOwnerInfo): boolean {
  // Absent posterRole (pre-Phase-9.1 documents) means "teacher" — only
  // teachers could create ANY question before students could, so this
  // mirrors questions.ts's toQuestion() default exactly rather than
  // silently notifying an owner who might not actually be a student.
  return question.posterRole === undefined || question.posterRole === null
    ? true
    : question.posterRole === "teacher";
}

// Who (if anyone) should be notified about a new answer/comment/like on a
// question. Returns null — nobody to notify — when: the question is gone
// (deleted between the child write and this running), the actor is the
// question's own owner (self-action), or the owner is a teacher (see the
// module doc comment above).
export function resolveQuestionEventRecipient(
  question: QuestionOwnerInfo | null,
  actorId: string,
): string | null {
  if (!question) return null;
  if (question.ownerId === actorId) return null;
  if (isTeacherOwnedQuestion(question)) return null;
  return question.ownerId;
}

export interface AnswerOwnerInfo {
  ownerId: string;
  // The answer owner's OWN account role ("teacher" | "student"), read from
  // users/{ownerId} — distinct from the question's posterRole above, since
  // an answer's owner and its parent question's owner are two different
  // people. No shipped route currently lets a teacher account own an
  // answer (only `(student)/answer/[questionId].tsx` exists), but this is
  // checked from the real account role rather than assumed, so the guard
  // holds even if that ever changes.
  ownerRole?: string | null;
}

export function resolveAnswerEventRecipient(
  answer: AnswerOwnerInfo | null,
  actorId: string,
): string | null {
  if (!answer) return null;
  if (answer.ownerId === actorId) return null;
  if (answer.ownerRole === "teacher") return null;
  return answer.ownerId;
}
