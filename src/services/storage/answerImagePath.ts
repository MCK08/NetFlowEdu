import { QuestionVisibility } from "@/types/question";

export type AnswerMethod = "photo" | "drawing";

export function getAnswerFileExtension(method: AnswerMethod): "png" | "jpg" {
  return method === "drawing" ? "png" : "jpg";
}

export function getAnswerContentType(method: AnswerMethod): "image/png" | "image/jpeg" {
  return method === "drawing" ? "image/png" : "image/jpeg";
}

// 'class' collapses to the 'private' Storage access level — same reasoning
// as questionImages.ts's accessLevelFor.
function accessLevelFor(visibility: QuestionVisibility): "public" | "private" {
  return visibility === "public" ? "public" : "private";
}

// Matches storage.rules `answers/{accessLevel}/{questionId}/{ownerId}/{fileName}`
// exactly — accessLevel mirrors the parent question's, since an answer
// image should be readable by whoever could read the question.
export function buildAnswerImagePath(
  questionId: string,
  uid: string,
  method: AnswerMethod,
  questionVisibility: QuestionVisibility,
  timestamp: number = Date.now(),
): string {
  return `answers/${accessLevelFor(questionVisibility)}/${questionId}/${uid}/${timestamp}.${getAnswerFileExtension(method)}`;
}
