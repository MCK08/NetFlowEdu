export type AnswerMethod = "photo" | "drawing";

export interface Answer {
  id: string;
  questionId: string;
  ownerId: string;
  imageUrl: string;
  method: AnswerMethod;
  createdAt: number;
}
