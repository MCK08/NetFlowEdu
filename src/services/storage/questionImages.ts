import { QuestionVisibility } from "@/types/question";

import { uploadImage } from "./uploadImage";

// 'class' collapses to the 'private' Storage access level — no real
// membership check exists yet, so it's owner-only-readable, same as
// private (see storage.rules' comment on questions/private/...).
function accessLevelFor(visibility: QuestionVisibility): "public" | "private" {
  return visibility === "public" ? "public" : "private";
}

// Matches storage.rules `questions/{accessLevel}/{ownerId}/{fileName}`.
export async function uploadQuestionImage(
  uid: string,
  localUri: string,
  visibility: QuestionVisibility,
): Promise<string> {
  const path = `questions/${accessLevelFor(visibility)}/${uid}/${Date.now()}.jpg`;
  return uploadImage(path, localUri, "image/jpeg");
}
