export type QuestionVisibility = "private" | "public" | "class";

export interface Question {
  id: string;
  ownerId: string;
  organizationId: string | null;
  visibility: QuestionVisibility;
  imageUrl: string;
  classId: string | null;
  createdAt: number;
  likeCount: number;
  commentCount: number;
  // Maintained server-side only by the onAnswerCreate Cloud Function —
  // firestore.rules blocks any client write to this field. See
  // functions/src/answers/onAnswerCreate.ts.
  answerCount: number;
}
