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
  await createAnswer({
    questionId: input.questionId,
    ownerId: input.uid,
    imageUrl,
    method: input.method,
  });
}
