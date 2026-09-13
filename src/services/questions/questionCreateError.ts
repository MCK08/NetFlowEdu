// Phase 89 — the create gateway's error model, deliberately in its own file.
//
// WHY NOT IN questions.ts
//
// questions.ts imports @services/firebase/config, which cannot be loaded under
// Jest: the platform persistence layer it pulls in is ESM, and the transform
// does not reach it. Phase 87 verified that empirically rather than assuming
// it. questionUploadErrorMapper.ts turns these codes into the sentences a
// composer shows, and it HAS a unit test — so importing the error type from
// questions.ts would have broken that test the moment the mapper learned about
// server refusals. It did, once; this file is the fix.
//
// Nothing here imports anything. That is the point.

export type QuestionCreateErrorCode =
  | "unauthenticated"
  | "not-member"
  | "class-not-found"
  | "invalid-question"
  | "unavailable";

export class QuestionCreateError extends Error {
  constructor(public readonly code: QuestionCreateErrorCode) {
    super(`question create refused: ${code}`);
    this.name = "QuestionCreateError";
  }
}
