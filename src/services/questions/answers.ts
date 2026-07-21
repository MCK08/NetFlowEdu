import { addDoc, collection, serverTimestamp } from "firebase/firestore";

import { db } from "@services/firebase/config";
import { AnswerMethod } from "@/types/answer";

export interface CreateAnswerInput {
  questionId: string;
  ownerId: string;
  imageUrl: string;
  method: AnswerMethod;
}

// Matches firestore.rules `answers/{answerId}` create rule exactly.
export async function createAnswer(input: CreateAnswerInput): Promise<void> {
  await addDoc(collection(db, "answers"), {
    questionId: input.questionId,
    ownerId: input.ownerId,
    imageUrl: input.imageUrl,
    method: input.method,
    createdAt: serverTimestamp(),
  });
}
