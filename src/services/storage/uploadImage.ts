import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

import { storage } from "@services/firebase/config";

// Shared by questionImages/answerImages/avatar uploads — accepts any local
// file:// uri or data: uri (e.g. the drawing board's base64 PNG export).
export async function uploadImage(
  path: string,
  localUri: string,
  contentType: string,
): Promise<string> {
  const response = await fetch(localUri);
  const blob = await response.blob();

  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType });
  return getDownloadURL(storageRef);
}
