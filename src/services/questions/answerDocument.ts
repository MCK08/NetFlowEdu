import { AnswerMethod } from "@/types/answer";

export interface CreateAnswerInput {
  questionId: string;
  ownerId: string;
  imageUrl: string;
  method: AnswerMethod;
}

// Matches firestore.rules `answers/{answerId}` create rule exactly: only
// these fields, ownerId == the caller, method is "photo" or "drawing".
// Excludes createdAt — serverTimestamp() is a write sentinel, not a plain
// value, so the actual Firestore write adds it separately.
export function buildAnswerDocument(input: CreateAnswerInput) {
  return {
    questionId: input.questionId,
    ownerId: input.ownerId,
    imageUrl: input.imageUrl,
    method: input.method,
  };
}
