import { uploadImage } from "./uploadImage";

// Matches the existing storage.rules `users/{userId}/avatar/{fileName}`
// block (already deployed, 2MB limit) — no rule changes needed for this.
export async function uploadAvatarImage(uid: string, localUri: string): Promise<string> {
  return uploadImage(`users/${uid}/avatar/${Date.now()}.jpg`, localUri, "image/jpeg");
}
