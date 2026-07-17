export type QuestionVisibility = "private" | "class" | "friends";

export interface Question {
  id: string;
  ownerId: string;
  organizationId: string;
  visibility: QuestionVisibility;
  imageUrl: string;
  classId: string | null;
  createdAt: number;
}
