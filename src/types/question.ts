export type QuestionVisibility = "private" | "public" | "class";

// Phase 21 — optional multiple-choice answer. Defined here (the base type
// layer) rather than in src/features/questions/services/multipleChoice.ts,
// which imports these FROM here instead — src/types/ has no existing
// precedent for depending on src/features/, and Question is the one place
// every consumer (feed, class feed, question detail, upload) already looks
// for this document's shape.
export const CHOICE_LABELS = ["A", "B", "C", "D", "E"] as const;
export type ChoiceLabel = (typeof CHOICE_LABELS)[number];

export interface QuestionChoices {
  A?: string;
  B?: string;
  C?: string;
  D?: string;
  E?: string;
}

// Who actually posted a question — meaningful for every visibility now that
// students can post class questions too (Phase 9.1), not just teachers.
// Denormalized onto the document at create time (same reasoning as
// ClassMessage.senderRole) and verified server-side against the caller's
// real classes/{classId}/members/{uid} role — never trusted from the client
// at face value, same "never trust a client role claim" invariant as
// firestore.rules applies everywhere else. Missing on documents created
// before this field existed defaults to "teacher" when read back (see
// toQuestion in questions.ts) — factually correct, since only teachers
// could create a class-visibility question before this phase.
export type QuestionPosterRole = "teacher" | "student";

export interface Question {
  id: string;
  ownerId: string;
  organizationId: string | null;
  visibility: QuestionVisibility;
  imageUrl: string;
  classId: string | null;
  // Free-text subject label chosen from src/features/classes/services/
  // subjects.ts's fixed list — "" for every question created before this
  // field existed (private/public questions never set it either; it's only
  // meaningful for class questions, but kept on the type generally rather
  // than split into a class-only sub-type, matching how classId itself is
  // "null unless visibility is class" rather than a separate variant).
  subject: string;
  // Phase 21 — same "" empty-string-for-legacy convention as `subject`
  // (never optional on the type itself; every question created before this
  // phase reads back as "" rather than undefined, so no consumer needs an
  // extra null-check that didn't already exist for subject).
  topic: string;
  gradeLevel: string;
  // Optional caption distinct from the image itself — null when omitted or
  // on any pre-existing question.
  description: string | null;
  posterRole: QuestionPosterRole;
  createdAt: number;
  likeCount: number;
  commentCount: number;
  // Maintained server-side only by the onAnswerCreate Cloud Function —
  // firestore.rules blocks any client write to this field. See
  // functions/src/answers/onAnswerCreate.ts.
  answerCount: number;
  // Phase 21 — optional multiple-choice answer. `choices` is null for
  // every question without one (which is every question before this phase,
  // and every question created after it that didn't turn the feature on).
  // `correctChoice` is only ever non-null when `choices` is non-null AND
  // names one of ITS OWN non-empty options — see multipleChoice.ts's
  // buildChoicesPayload, the one place that invariant is enforced before
  // either field is ever written.
  choices: QuestionChoices | null;
  correctChoice: ChoiceLabel | null;
}
