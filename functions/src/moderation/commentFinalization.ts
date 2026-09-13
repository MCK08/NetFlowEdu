import type { DocumentReference, Transaction } from "firebase-admin/firestore";

// Phase 98 — THE ONE WAY an approved comment becomes a published comment.
//
// Before this file, publication lived inline in
// submitQuestionCommentForModeration's approval branch. Phase 98 adds a second
// caller — the class teacher's manual approval of a comment the deterministic
// text layer could not settle — and with two callers the shape of a published
// comment must have exactly one author, or the two paths drift.
//
// No Storage step here: a comment is text, and the text that is published is
// exactly the text the moderation submission retained — never a reviewer's
// rewrite, because there is no parameter for one.
//
// onQuestionCommentCreate then does what it has always done on that one
// document: commentCount += 1 and the question owner's notification. Neither
// caller touches a counter or a notification directly.

export interface PublishedCommentInput {
  questionId: string;
  ownerId: string;
  text: string;
  /** Server clock at publication. */
  now: number;
}

/**
 * The published comment document. Defined ONCE.
 *
 * `status: "active"` and a millisecond `createdAt` are what the client's
 * toComment() and the Phase 93 delete gateway read.
 */
export function buildPublishedCommentDocument(input: PublishedCommentInput): {
  questionId: string;
  ownerId: string;
  text: string;
  status: "active";
  createdAt: Date;
} {
  return {
    questionId: input.questionId,
    ownerId: input.ownerId,
    text: input.text,
    status: "active",
    createdAt: new Date(input.now),
  };
}

/**
 * Writes the comment document inside the caller's transaction.
 *
 * The caller has already decided, inside that same transaction, that the
 * submission is `approved` and has chosen `commentRef` — so the status and
 * the comment's existence commit together or not at all.
 */
export function finalizeApprovedComment(
  tx: Transaction,
  commentRef: DocumentReference,
  input: PublishedCommentInput,
): void {
  tx.set(commentRef, buildPublishedCommentDocument(input));
}
