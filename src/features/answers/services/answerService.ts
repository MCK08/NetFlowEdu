import { uploadAnswerImage } from "@services/storage/answerImages";
import { createAnswer } from "@services/questions/answers";

import { AnswerMethod } from "../types";

interface SubmitAnswerInput {
  questionId: string;
  uid: string;
  localUri: string;
  method: AnswerMethod;
}

// TEMPORARY diagnostic instrumentation — remove once the Expo Go
// answer-upload bug (both photo and drawing) is confirmed fixed. Tags which
// stage threw so the caller can show a stage-aware message without
// re-deriving it; kept minimal (no payload/URI contents) even for the
// stack/message, which are logged separately in dev only.
export class AnswerUploadStageError extends Error {
  readonly stage: string;
  override readonly cause: unknown;

  constructor(stage: string, cause: unknown) {
    super(`Answer upload failed at stage: ${stage}`);
    this.stage = stage;
    this.cause = cause;
  }
}

export async function submitAnswer(input: SubmitAnswerInput): Promise<void> {
  if (__DEV__) {
    console.log("[ANSWER_UPLOAD] answer method", input.method);
    console.log("[ANSWER_UPLOAD] questionId", input.questionId);
    console.log("[ANSWER_UPLOAD] authenticated uid exists", Boolean(input.uid));
  }

  let imageUrl: string;
  try {
    imageUrl = await uploadAnswerImage(input.questionId, input.uid, input.localUri, input.method);
  } catch (error) {
    throw new AnswerUploadStageError("storage-upload", error);
  }

  const payload = {
    questionId: input.questionId,
    ownerId: input.uid,
    imageUrl,
    method: input.method,
  };

  if (__DEV__) {
    console.log("[ANSWER_UPLOAD] Firestore payload keys", Object.keys(payload));
    console.log("[ANSWER_UPLOAD] Firestore write started");
  }

  try {
    await createAnswer(payload);
  } catch (error) {
    throw new AnswerUploadStageError("firestore-write", error);
  }

  if (__DEV__) console.log("[ANSWER_UPLOAD] Firestore write completed");
}
