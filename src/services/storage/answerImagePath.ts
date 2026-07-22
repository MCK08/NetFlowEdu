export type AnswerMethod = "photo" | "drawing";

export function getAnswerFileExtension(method: AnswerMethod): "png" | "jpg" {
  return method === "drawing" ? "png" : "jpg";
}

export function getAnswerContentType(method: AnswerMethod): "image/png" | "image/jpeg" {
  return method === "drawing" ? "image/png" : "image/jpeg";
}

// Matches storage.rules `answers/{questionId}/{ownerId}/{fileName}` exactly.
export function buildAnswerImagePath(
  questionId: string,
  uid: string,
  method: AnswerMethod,
  timestamp: number = Date.now(),
): string {
  return `answers/${questionId}/${uid}/${timestamp}.${getAnswerFileExtension(method)}`;
}
