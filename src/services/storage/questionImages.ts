import { uploadImage } from "./uploadImage";

// Matches the owner-scoped storage.rules match block for questions/{ownerId}/{fileName}.
export async function uploadQuestionImage(uid: string, localUri: string): Promise<string> {
  return uploadImage(`questions/${uid}/${Date.now()}.jpg`, localUri, "image/jpeg");
}
