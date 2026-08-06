import { httpsCallable } from "firebase/functions";

import { functions } from "@services/firebase/config";
import { uploadAnswerToQuarantine } from "@services/storage/answerQuarantine";

import { AnswerMethod } from "../types";

// Client side of the answer publication gate.
//
// The old flow was: upload straight to answers/{public|private}/... (world-
// readable to signed-in users), then addDoc into `answers`. The image was
// visible to classmates the moment the upload completed, and the resulting
// document fired the answer counter and the question-owner notification.
//
// The new flow uploads to a PRIVATE quarantine path and asks the server to
// decide. The client never learns why a decision was reached — no Vision
// scores, no categories, no matched terms.

/** The only moderation vocabulary the client knows. */
export type AnswerSubmissionStatus = "published" | "in_review" | "not_published" | "checking";

export interface AnswerSubmissionResult {
  submissionId: string;
  status: AnswerSubmissionStatus;
  publishedEntityId: string | null;
}

// Same format the backend validates (OPERATION_ID_PATTERN). A malformed id
// is rejected server-side rather than ignored, so this must stay in step.
export function createAnswerOperationId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  const stamp = Date.now().toString(36);
  return `${stamp}-${random}`;
}

interface SubmitAnswerInput {
  questionId: string;
  uid: string;
  localUri: string;
  method: AnswerMethod;
  /** Held across retries of ONE gesture, so a retry after a lost response
   *  reuses the same submission instead of creating a second one — and, just
   *  as importantly, does not pay for a second Vision analysis. */
  operationId: string;
}

export async function submitAnswer(input: SubmitAnswerInput): Promise<AnswerSubmissionResult> {
  // The submission id is derived the same way the server derives it, so the
  // quarantine path the client writes is the exact path the server expects.
  const submissionId = `${input.uid}_${input.operationId}`;

  const { storagePath, contentType } = await uploadAnswerToQuarantine(
    input.uid,
    submissionId,
    input.localUri,
    input.method,
  );

  const callable = httpsCallable<
    {
      questionId: string;
      storagePath: string;
      contentType: string;
      method: AnswerMethod;
      operationId: string;
    },
    AnswerSubmissionResult
  >(functions, "submitAnswerForModeration");

  const result = await callable({
    questionId: input.questionId,
    storagePath,
    contentType,
    method: input.method,
    operationId: input.operationId,
  });
  return result.data;
}
