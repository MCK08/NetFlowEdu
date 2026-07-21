import * as ImagePicker from "expo-image-picker";

import { createQuestion } from "@services/questions/questions";
import { uploadQuestionImage } from "@services/storage/questionImages";
import { Question } from "@/types/question";

export class CameraPermissionDeniedError extends Error {
  constructor() {
    super("CAMERA_PERMISSION_DENIED");
  }
}

interface CaptureAndUploadInput {
  uid: string;
  organizationId: string | null;
}

// Returns null when the user cancels the camera without taking a photo —
// that's not an error, just a no-op. Throws CameraPermissionDeniedError or
// a generic Error (upload/Firestore failure) for the caller to map to UI.
export async function captureAndUploadQuestion(
  input: CaptureAndUploadInput,
): Promise<Question | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new CameraPermissionDeniedError();
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 0.7,
  });
  if (result.canceled || result.assets.length === 0) {
    return null;
  }

  const localUri = result.assets[0]?.uri;
  if (!localUri) return null;

  const imageUrl = await uploadQuestionImage(input.uid, localUri);
  const id = await createQuestion({
    ownerId: input.uid,
    organizationId: input.organizationId,
    imageUrl,
  });

  return {
    id,
    ownerId: input.uid,
    organizationId: input.organizationId,
    visibility: "private",
    imageUrl,
    classId: null,
    likes: 0,
    comments: 0,
    createdAt: Date.now(),
  };
}
