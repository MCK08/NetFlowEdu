import * as ImagePicker from "expo-image-picker";

import { createQuestion } from "@services/questions/questions";
import { uploadQuestionImage } from "@services/storage/questionImages";
import { ChoiceLabel, Question, QuestionChoices, QuestionPosterRole, QuestionVisibility } from "@/types/question";

export class CameraPermissionDeniedError extends Error {
  constructor() {
    super("CAMERA_PERMISSION_DENIED");
  }
}

export class GalleryPermissionDeniedError extends Error {
  constructor() {
    super("GALLERY_PERMISSION_DENIED");
  }
}

// Shared by captureAndUploadClassQuestion and pickQuestionImage("camera") —
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

// Gallery counterpart to captureImage — same permission/launch/cancel shape,
// used by the student question composer (Phase 9.1's "choose from gallery"
// requirement; nothing in this app picked from the library for a QUESTION
// image before this). Same 0.7 JPEG quality as the camera path, for
// consistent upload size regardless of source.
async function pickImageFromGallery(): Promise<string | null> {
  if (__DEV__) console.log("[QUESTION_UPLOAD] requestMediaLibraryPermissionsAsync started");
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (__DEV__) console.log("[QUESTION_UPLOAD] requestMediaLibraryPermissionsAsync result", permission);
  if (!permission.granted) {
    throw new GalleryPermissionDeniedError();
  }

  if (__DEV__) console.log("[QUESTION_UPLOAD] launchImageLibraryAsync started");
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.7,
  });
  if (__DEV__) console.log("[QUESTION_UPLOAD] launchImageLibraryAsync returned", { canceled: result.canceled, assetCount: result.assets?.length ?? 0 });
  if (result.canceled || result.assets.length === 0) {
    return null;
  }

  return result.assets[0]?.uri ?? null;
}

export type QuestionImageSource = "camera" | "gallery";

// Picks up an image from whichever source the caller asked for — the one
// entry point the student composer (and, if ever needed, any future
// teacher-side gallery option) calls, instead of each screen deciding
// between captureImage/pickImageFromGallery itself.
export async function pickQuestionImage(source: QuestionImageSource): Promise<string | null> {
  return source === "gallery" ? pickImageFromGallery() : captureImage();
}

// Returns null when the user cancels the camera without taking a photo —
// that's not an error, just a no-op. Throws CameraPermissionDeniedError or
// a generic Error (upload/Firestore failure) for the caller to map to UI.
export interface QuestionMetadataInput {
  subject: string;
  topic: string;
  gradeLevel: string;
  description?: string | null;
  choices?: QuestionChoices | null;
  correctChoice?: ChoiceLabel | null;
}

interface UploadQuestionInput extends QuestionMetadataInput {
  uid: string;
  organizationId: string | null;
  visibility: QuestionVisibility;
  localUri: string;
}

// Phase 21 — the upload+create half of the main "Akış" tab's composer, now
// a two-stage flow (pick image → fill in mandatory subject/grade/topic +
// optional multiple choice → THEN upload) exactly like the class composer
// already was (uploadClassQuestionImage below), instead of the old
// captureAndUploadQuestion's single-stage "capture and immediately upload
// with no metadata at all". Every caller (useUpload) already has the local
// image URI by the time this runs — see pickQuestionImage.
export async function uploadQuestionWithMetadata(input: UploadQuestionInput): Promise<Question> {
  if (__DEV__) console.log("[QUESTION_UPLOAD] uploadQuestionImage started");
  const imageUrl = await uploadQuestionImage(input.uid, input.localUri, input.visibility);
  if (__DEV__) console.log("[QUESTION_UPLOAD] uploadQuestionImage completed");
  const id = await createQuestion({
    ownerId: input.uid,
    organizationId: input.organizationId,
    imageUrl,
    visibility: input.visibility,
    // FeedScreen (app/(student)/(tabs)/index.tsx) is the only screen that
    // calls this — a student-only route today, so this is always accurate.
    // If a teacher-facing private/public upload entry point is ever added,
    // this needs to become a real parameter like captureAndUploadClassQuestion's.
    posterRole: "student",
    subject: input.subject,
    topic: input.topic,
    gradeLevel: input.gradeLevel,
    description: input.description ?? null,
    choices: input.choices ?? null,
    correctChoice: input.correctChoice ?? null,
  });

  return {
    id,
    ownerId: input.uid,
    organizationId: input.organizationId,
    visibility: input.visibility,
    imageUrl,
    classId: null,
    subject: input.subject,
    topic: input.topic,
    gradeLevel: input.gradeLevel,
    description: input.description ?? null,
    posterRole: "student",
    likeCount: 0,
    commentCount: 0,
    answerCount: 0,
    createdAt: Date.now(),
    choices: input.choices ?? null,
    correctChoice: input.correctChoice ?? null,
  };
}

interface CaptureAndUploadClassInput {
  uid: string;
  organizationId: string;
  classId: string;
  // Required, not defaulted — forces every call site (teacher's one-tap
  // button, the student composer) to state explicitly who's posting,
  // exactly matching firestore.rules' requirement that this be verified
  // against the caller's own membership role.
  posterRole: QuestionPosterRole;
  // Optional so the teacher's existing one-tap flow (camera only, no
  // description/subject) keeps working completely unchanged by omitting
  // them — imageSource defaults to "camera" for the exact same reason.
  imageSource?: QuestionImageSource;
  subject?: string;
  description?: string | null;
  topic?: string;
  gradeLevel?: string;
  choices?: QuestionChoices | null;
  correctChoice?: ChoiceLabel | null;
}

interface UploadClassQuestionInput {
  uid: string;
  organizationId: string;
  classId: string;
  posterRole: QuestionPosterRole;
  localUri: string;
  subject?: string;
  description?: string | null;
  topic?: string;
  gradeLevel?: string;
  choices?: QuestionChoices | null;
  correctChoice?: ChoiceLabel | null;
}

// The upload+create half of captureAndUploadClassQuestion, split out so a
// caller that already has a local image URI (the student composer: pick
// image → preview → fill in subject/description → THEN upload) doesn't
// have to go through pickQuestionImage a second time. Both this and
// captureAndUploadClassQuestion end up calling the exact same
// uploadQuestionImage/createQuestion pair — no duplicated upload logic.
export async function uploadClassQuestionImage(
  input: UploadClassQuestionInput,
): Promise<Question> {
  const imageUrl = await uploadQuestionImage(input.uid, input.localUri, "class", {
    organizationId: input.organizationId,
    classId: input.classId,
  });

  if (__DEV__) console.log("[QUESTION_UPLOAD] firestore create started");
  const id = await createQuestion({
    ownerId: input.uid,
    organizationId: input.organizationId,
    imageUrl,
    visibility: "class",
    classId: input.classId,
    posterRole: input.posterRole,
    subject: input.subject,
    description: input.description,
    topic: input.topic,
    gradeLevel: input.gradeLevel,
    choices: input.choices ?? null,
    correctChoice: input.correctChoice ?? null,
  });
  if (__DEV__) console.log("[QUESTION_UPLOAD] firestore create succeeded");

  return {
    id,
    ownerId: input.uid,
    organizationId: input.organizationId,
    visibility: "class",
    imageUrl,
    classId: input.classId,
    subject: input.subject ?? "",
    description: input.description ?? null,
    topic: input.topic ?? "",
    gradeLevel: input.gradeLevel ?? "",
    posterRole: input.posterRole,
    likeCount: 0,
    commentCount: 0,
    answerCount: 0,
    createdAt: Date.now(),
    choices: input.choices ?? null,
    correctChoice: input.correctChoice ?? null,
  };
}

// Same camera-or-gallery/upload path as captureAndUploadQuestion, fixed to
// visibility 'class' — used from a class's own detail screen (teacher),
// where the class (and therefore the visibility) is already determined by
// context, so there's no public/private picker step. See src/features/classes.
export async function captureAndUploadClassQuestion(
  input: CaptureAndUploadClassInput,
): Promise<Question | null> {
  const localUri = await pickQuestionImage(input.imageSource ?? "camera");
  if (!localUri) return null;

  return uploadClassQuestionImage({ ...input, localUri });
}
