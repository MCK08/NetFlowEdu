import { QuestionVisibility } from "@/types/question";

import { uploadImage } from "./uploadImage";

export interface UploadQuestionImageOptions {
  // Required only when visibility === "class" — see storage.rules'
  // questions/class/{organizationId}/{classId}/{ownerId}/{fileName}.
  organizationId?: string | null;
  classId?: string | null;
}

// Matches storage.rules' three question path shapes:
//   questions/public/{ownerId}/{fileName}
//   questions/private/{ownerId}/{fileName}
//   questions/class/{organizationId}/{classId}/{ownerId}/{fileName}
export async function uploadQuestionImage(
  uid: string,
  localUri: string,
  visibility: QuestionVisibility,
  options: UploadQuestionImageOptions = {},
): Promise<string> {
  const fileName = `${Date.now()}.jpg`;

  if (visibility === "class") {
    if (!options.classId || !options.organizationId) {
      // storage.rules' class path segment is compared against the caller's
      // organizationId claim directly — there's no way to encode "no
      // organization" as a path segment that a null claim could ever match,
      // so a class question always requires a real organizationId (classes
      // themselves already require one — see createClass).
      throw new Error("classId and organizationId are required to upload a class question image.");
    }
    const path = `questions/class/${options.organizationId}/${options.classId}/${uid}/${fileName}`;
    return uploadImage(path, localUri, "image/jpeg");
  }

  const accessLevel = visibility === "public" ? "public" : "private";
  const path = `questions/${accessLevel}/${uid}/${fileName}`;
  return uploadImage(path, localUri, "image/jpeg");
}
