import { updateOwnProfile } from "@services/firebase/firestore";
import { uploadAvatarImage } from "@services/storage/avatarImages";

export interface EditProfileInput {
  uid: string;
  displayName: string;
  newPhotoLocalUri: string | null;
}

// Only displayName/photoURL are ever touched here — matches firestore.rules
// exactly (role/points/organization/email/status stay server-managed).
export async function saveProfileEdits(input: EditProfileInput): Promise<void> {
  const photoURL = input.newPhotoLocalUri
    ? await uploadAvatarImage(input.uid, input.newPhotoLocalUri)
    : undefined;

  await updateOwnProfile(input.uid, {
    displayName: input.displayName.trim(),
    ...(photoURL ? { photoURL } : {}),
  });
}
