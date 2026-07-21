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
}
