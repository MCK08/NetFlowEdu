import { uploadAnswerImage } from "@services/storage/answerImages";
import { createAnswer } from "@services/questions/answers";

import { AnswerMethod } from "../types";

interface SubmitAnswerInput {
  questionId: string;
  uid: string;
  localUri: string;
  method: AnswerMethod;
}

export async function submitAnswer(input: SubmitAnswerInput): Promise<void> {
  const imageUrl = await uploadAnswerImage(input.questionId, input.uid, input.localUri, input.method);

  // TEMPORARY diagnostic instrumentation — remove once the production-
  // device drawing-save bug is confirmed fixed.
  if (__DEV__ && input.method === "drawing") console.log("[DRAWING] Firestore write started");

  await createAnswer({
    questionId: input.questionId,
    ownerId: input.uid,
    imageUrl,
    method: input.method,
  });

  if (__DEV__ && input.method === "drawing") console.log("[DRAWING] Firestore write completed");
}
