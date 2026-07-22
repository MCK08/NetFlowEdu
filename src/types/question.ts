export type QuestionVisibility = "private" | "class" | "friends";

export interface Question {
  id: string;
  ownerId: string;
  organizationId: string | null;
  visibility: QuestionVisibility;
  imageUrl: string;
  classId: string | null;
  createdAt: number;
  likes: number;
  comments: number;
  // Maintained server-side only by the onAnswerCreate Cloud Function —
  // firestore.rules blocks any client write to this field. See
  // functions/src/answers/onAnswerCreate.ts.
  answerCount: number;
}
