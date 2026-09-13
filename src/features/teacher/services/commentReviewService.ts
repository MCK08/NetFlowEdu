import { httpsCallable } from "firebase/functions";

import { functions } from "@services/firebase/config";

// Phase 98 — the three comment review callables, and nothing else. No
// Firestore query: the server verifies the caller is the class's canonical
// teacher and returns a bounded, already-scoped page. See
// functions/src/review/commentReview.ts.

export interface CommentReviewQueueItem {
  /** Opaque handle for the detail and decision calls. Never rendered. */
  submissionId: string;
  submittedAt: number;
  reviewReason: string;
  /** The retained submission text — exactly what would be published. */
  text: string;
  question: { description: string | null; subject: string; topic: string; imageUrl: string | null };
  author: { displayName: string };
}

export interface CommentReviewQueuePage {
  items: CommentReviewQueueItem[];
  nextCursor: string | null;
  pageSize: number;
}

export interface CommentReviewDetail extends CommentReviewQueueItem {
  status: string;
}

export type CommentReviewDecision = "approve" | "reject";

export interface CommentReviewResult {
  submissionId: string;
  status: "approved" | "rejected";
  publishedEntityId: string | null;
  alreadyDecided: boolean;
}

export async function listCommentReviewQueue(
  classId: string,
  cursor: string | null,
): Promise<CommentReviewQueuePage> {
  const callable = httpsCallable<{ classId: string; cursor?: string }, CommentReviewQueuePage>(
    functions,
    "listCommentReviewQueue",
  );
  const result = await callable({ classId, ...(cursor ? { cursor } : {}) });
  return result.data;
}

export async function getCommentReviewDetail(submissionId: string): Promise<CommentReviewDetail> {
  const callable = httpsCallable<{ submissionId: string }, CommentReviewDetail>(
    functions,
    "getCommentReviewDetail",
  );
  const result = await callable({ submissionId });
  return result.data;
}

export async function reviewCommentSubmission(
  submissionId: string,
  decision: CommentReviewDecision,
): Promise<CommentReviewResult> {
  const callable = httpsCallable<
    { submissionId: string; decision: CommentReviewDecision },
    CommentReviewResult
  >(functions, "reviewCommentSubmission");
  const result = await callable({ submissionId, decision });
  return result.data;
}
