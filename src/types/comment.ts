export type CommentStatus = "active" | "deleted";

export interface QuestionComment {
  id: string;
  questionId: string;
  ownerId: string;
  text: string;
  createdAt: number;
  status: CommentStatus;
}
