import { httpsCallable } from "firebase/functions";

import { functions } from "@services/firebase/config";

// Client side of the comment publication gate.
//
// The client no longer writes questionComments — firestore.rules denies it
// (see the Phase 17 block there). It asks the server to consider the text,
// and the server decides whether a comment exists at all.
//
// Nothing about HOW that decision is made lives on this side: no term list,
// no normalizer, no categories, no scores. The client learns one of four
// neutral statuses and nothing more. That is deliberate — shipping the
// matching logic would hand anyone with the app a local oracle to test
// bypasses against.

/** The only moderation vocabulary the client knows. */
export type CommentSubmissionStatus =
  | "published"
  | "in_review"
  | "not_published"
  | "checking";

export interface CommentSubmissionResult {
  submissionId: string;
  status: CommentSubmissionStatus;
  /** Present only when the comment was actually published. */
  publishedEntityId: string | null;
}

// Same format the backend validates (see functions/src/study/operationId.ts's
// OPERATION_ID_PATTERN, which submitQuestionCommentForModeration reuses). A
// malformed id is rejected by the server rather than ignored, so this must
// stay in step with it.
export function createCommentOperationId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  const stamp = Date.now().toString(36);
  return `${stamp}-${random}`;
}

export async function submitCommentForModeration(
  questionId: string,
  text: string,
  operationId: string,
): Promise<CommentSubmissionResult> {
  const callable = httpsCallable<
    { questionId: string; text: string; operationId: string },
    CommentSubmissionResult
  >(functions, "submitQuestionCommentForModeration");
  const result = await callable({ questionId, text, operationId });
  return result.data;
}
