import * as ImagePicker from "expo-image-picker";

import { createQuestion } from "@services/questions/questions";
import { uploadQuestionImage } from "@services/storage/questionImages";
import { Question, QuestionVisibility } from "@/types/question";

export class CameraPermissionDeniedError extends Error {
  constructor() {
    super("CAMERA_PERMISSION_DENIED");
  }
}

interface CaptureAndUploadInput {
  uid: string;
  organizationId: string | null;
  visibility: QuestionVisibility;
}

// Shared by captureAndUploadQuestion and captureAndUploadClassQuestion —
// the camera permission/launch dance is identical for every visibility, so
// it's factored out once rather than duplicated. Returns null on
// cancel/no-asset (not an error), throws CameraPermissionDeniedError
// otherwise.
async function captureImage(): Promise<string | null> {
  if (__DEV__) console.log("[QUESTION_UPLOAD] requestCameraPermissionsAsync started");
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (__DEV__) console.log("[QUESTION_UPLOAD] requestCameraPermissionsAsync result", permission);
  if (!permission.granted) {
    throw new CameraPermissionDeniedError();
  }

  if (__DEV__) console.log("[QUESTION_UPLOAD] launchCameraAsync started");
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 0.7,
  });
  if (__DEV__) console.log("[QUESTION_UPLOAD] launchCameraAsync returned", { canceled: result.canceled, assetCount: result.assets?.length ?? 0 });
  if (result.canceled || result.assets.length === 0) {
    return null;
  }

  return result.assets[0]?.uri ?? null;
}

// Returns null when the user cancels the camera without taking a photo —
// that's not an error, just a no-op. Throws CameraPermissionDeniedError or
// a generic Error (upload/Firestore failure) for the caller to map to UI.
export async function captureAndUploadQuestion(
  input: CaptureAndUploadInput,
): Promise<Question | null> {
  const localUri = await captureImage();
  if (!localUri) return null;

  if (__DEV__) console.log("[QUESTION_UPLOAD] uploadQuestionImage started");
  const imageUrl = await uploadQuestionImage(input.uid, localUri, input.visibility);
  if (__DEV__) console.log("[QUESTION_UPLOAD] uploadQuestionImage completed");
  const id = await createQuestion({
    ownerId: input.uid,
    organizationId: input.organizationId,
    imageUrl,
    visibility: input.visibility,
  });

  return {
    id,
    ownerId: input.uid,
    organizationId: input.organizationId,
    visibility: input.visibility,
    imageUrl,
    classId: null,
    likeCount: 0,
    commentCount: 0,
    answerCount: 0,
    createdAt: Date.now(),
  };
}

interface CaptureAndUploadClassInput {
  uid: string;
  organizationId: string;
  classId: string;
}

// Same camera/upload path as captureAndUploadQuestion, fixed to visibility
// 'class' — used from a class's own detail screen, where the class (and
// therefore the visibility) is already determined by context, so there's no
// picker step. See src/features/classes.
export async function captureAndUploadClassQuestion(
  input: CaptureAndUploadClassInput,
): Promise<Question | null> {
  const localUri = await captureImage();
  if (!localUri) return null;

  const imageUrl = await uploadQuestionImage(input.uid, localUri, "class", {
    organizationId: input.organizationId,
    classId: input.classId,
  });
  const id = await createQuestion({
    ownerId: input.uid,
    organizationId: input.organizationId,
    imageUrl,
    visibility: "class",
    classId: input.classId,
  });

  return {
    id,
    ownerId: input.uid,
    organizationId: input.organizationId,
    visibility: "class",
    imageUrl,
    classId: input.classId,
    likeCount: 0,
    commentCount: 0,
    answerCount: 0,
    createdAt: Date.now(),
  };
}
