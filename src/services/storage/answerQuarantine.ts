import { ref, uploadBytes } from "firebase/storage";

import { storage } from "@services/firebase/config";

import { AnswerMethod, buildQuarantinePath, getAnswerContentType } from "./answerImagePath";

// Uploads an answer image to the PRIVATE moderation quarantine.
//
// Two deliberate differences from the old uploadAnswerImage this replaces:
//
// 1. The destination is moderation/pending/{uid}/{submissionId}/..., which
//    storage.rules makes readable by its owner only. The old path was
//    answers/public/..., readable by every signed-in user the moment the
//    upload finished — before any moderation, and before the answer document
//    even existed.
//
// 2. It returns the PATH, not a download URL. getDownloadURL() is not called,
//    so no shareable link to unmoderated content is ever minted. The server
//    publishes the approved copy and mints the URL for that.

export type { AnswerMethod } from "./answerImagePath";

export { buildQuarantinePath } from "./answerImagePath";

/**
 * Uploads the local image to quarantine and returns the storage path.
 *
 * Deterministic in (uid, submissionId), so retrying the same gesture
 * overwrites the same object rather than leaving an orphan behind.
 */
export async function uploadAnswerToQuarantine(
  uid: string,
  submissionId: string,
  localUri: string,
  method: AnswerMethod,
): Promise<{ storagePath: string; contentType: string }> {
  const contentType = getAnswerContentType(method);
  const storagePath = buildQuarantinePath(uid, submissionId, contentType);

  // Same conversion path uploadImage() uses for data: URIs (the drawing
  // export) and file:// URIs (camera/gallery) — see that file for why a
  // Blob cannot be built from an ArrayBuffer on React Native.
  const { toUploadableUri } = await import("./uploadImage");
  const fileUri = await toUploadableUri(localUri);
  const response = await fetch(fileUri);
  const blob = await response.blob();

  await uploadBytes(ref(storage, storagePath), blob, { contentType });
  return { storagePath, contentType };
}
