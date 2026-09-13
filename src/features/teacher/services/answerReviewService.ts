import { httpsCallable } from "firebase/functions";

import { functions } from "@services/firebase/config";

// Phase 97 — the three review callables, and nothing else.
//
// There is deliberately no Firestore query in this file. A teacher never
// reads moderationSubmissions directly (firestore.rules keep it author-only);
// the server verifies the caller is the class's canonical teacher and returns
// a bounded, already-scoped page. See functions/src/review/answerReview.ts.

export type AnswerReviewMethod = "photo" | "drawing";

export interface AnswerReviewQueueItem {
  /** Opaque handle for the detail and decision calls. Never rendered. */
  submissionId: string;
  submittedAt: number;
  reviewReason: string;
  method: AnswerReviewMethod;
  question: { description: string | null; subject: string; topic: string; imageUrl: string | null };
  author: { displayName: string };
}

export interface AnswerReviewQueuePage {
  items: AnswerReviewQueueItem[];
  nextCursor: string | null;
  pageSize: number;
}

export interface AnswerReviewDetail extends AnswerReviewQueueItem {
  status: string;
  /** Server-issued access to the submitted image while the review is open. */
  imageUrl: string | null;
}

export type AnswerReviewDecision = "approve" | "reject";

export interface AnswerReviewResult {
  submissionId: string;
  status: "approved" | "rejected";
  publishedEntityId: string | null;
  alreadyDecided: boolean;
}

export async function listAnswerReviewQueue(
  classId: string,
  cursor: string | null,
): Promise<AnswerReviewQueuePage> {
  const callable = httpsCallable<{ classId: string; cursor?: string }, AnswerReviewQueuePage>(
    functions,
    "listAnswerReviewQueue",
  );
  const result = await callable({ classId, ...(cursor ? { cursor } : {}) });
  return result.data;
}

export async function getAnswerReviewDetail(submissionId: string): Promise<AnswerReviewDetail> {
  const callable = httpsCallable<{ submissionId: string }, AnswerReviewDetail>(
    functions,
    "getAnswerReviewDetail",
  );
  const result = await callable({ submissionId });
  return result.data;
}

export async function reviewAnswerSubmission(
  submissionId: string,
  decision: AnswerReviewDecision,
): Promise<AnswerReviewResult> {
  const callable = httpsCallable<
    { submissionId: string; decision: AnswerReviewDecision },
    AnswerReviewResult
  >(functions, "reviewAnswerSubmission");
  const result = await callable({ submissionId, decision });
  return result.data;
}
