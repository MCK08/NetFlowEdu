import { uploadImage } from "./uploadImage";

export type AnswerMethod = "photo" | "drawing";

// Matches storage.rules `answers/{questionId}/{ownerId}/{fileName}`.
export async function uploadAnswerImage(
  questionId: string,
  uid: string,
  localUri: string,
  method: AnswerMethod,
): Promise<string> {
  const extension = method === "drawing" ? "png" : "jpg";
  const contentType = method === "drawing" ? "image/png" : "image/jpeg";
  return uploadImage(
    `answers/${questionId}/${uid}/${Date.now()}.${extension}`,
    localUri,
    contentType,
  );
}
