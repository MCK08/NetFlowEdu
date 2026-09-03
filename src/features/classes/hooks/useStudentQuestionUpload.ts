import { useState } from "react";
import { Alert } from "react-native";

import { useSubmitLock } from "@hooks/useSubmitLock";

import { QuestionMetadataDetails } from "@features/questions/components/QuestionMetadataModal";
import {
  CameraPermissionDeniedError,
  GalleryPermissionDeniedError,
  pickQuestionImage,
  QuestionImageSource,
  uploadClassQuestionImage,
} from "@features/upload/services/uploadService";
import { mapQuestionUploadErrorToMessage } from "@features/upload/services/questionUploadErrorMapper";
import { Question } from "@/types/question";

interface UseStudentQuestionUploadOptions {
  uid: string | undefined;
  organizationId: string | null;
  classId: string;
  onUploaded: (question: Question) => void;
}

// Two-stage version of useClassUpload's single-tap capture: the student
// needs to see the picked image and choose a subject/add a description
// before it's actually uploaded, unlike the teacher's immediate
// capture-and-post. Both stages reuse the exact same upload primitives
// (pickQuestionImage, uploadClassQuestionImage) that back the teacher's
// flow — nothing here duplicates the camera/gallery/upload logic itself.
export function useStudentQuestionUpload({
  uid,
  organizationId,
  classId,
  onUploaded,
}: UseStudentQuestionUploadOptions) {
  const [isSourcePickerOpen, setIsSourcePickerOpen] = useState(false);
  const [pickedImageUri, setPickedImageUri] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  // Phase 75 — synchronous double-submit guard for the create below.
  const submitLock = useSubmitLock();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function openComposer() {
    if (!uid || !organizationId || isUploading) return;
    setIsSourcePickerOpen(true);
  }

  function cancelSourcePicker() {
    setIsSourcePickerOpen(false);
  }

  // Called by ImageSourcePicker's onSelect only after it has already faded
  // out and unmounted itself (see ImageSourcePicker) — no picker UI exists
  // by the time the native camera/gallery launches, same reasoning as
  // useUpload's captureWithVisibility.
  async function selectImageSource(source: QuestionImageSource) {
    setIsSourcePickerOpen(false);
    if (!uid || !organizationId) return;

    try {
      const uri = await pickQuestionImage(source);
      if (uri) setPickedImageUri(uri);
    } catch (error) {
      if (error instanceof CameraPermissionDeniedError) {
        Alert.alert(
          "Kamera izni gerekli",
          "Soru fotoğrafı çekebilmek için kamera erişimine izin vermelisiniz. Ayarlar üzerinden izni etkinleştirebilirsiniz.",
        );
      } else if (error instanceof GalleryPermissionDeniedError) {
        Alert.alert(
          "Galeri izni gerekli",
          "Fotoğraf seçebilmek için galeri erişimine izin vermelisiniz. Ayarlar üzerinden izni etkinleştirebilirsiniz.",
        );
      } else {
        Alert.alert("Bir hata oluştu", "Lütfen tekrar deneyin.");
      }
    }
  }

  function cancelDetails() {
    setPickedImageUri(null);
    setErrorMessage(null);
  }

  async function submitDetails(details: QuestionMetadataDetails) {
    if (!uid || !organizationId || !pickedImageUri) return;
    // Phase 75 — the lock is acquired here, synchronously, INSTEAD of relying
    // on the `isUploading` state read below. Question creation is the one
    // durable write left with no operationId backstop (answers, comments and
    // study outcomes all carry one), so a second run genuinely creates a
    // second Storage object and a second question document. A state read
    // cannot close that window — see utils/submitLock.ts.
    if (!submitLock.acquire()) return;
    setErrorMessage(null);
    setIsUploading(true);
    if (__DEV__) {
      console.log("[QUESTION_UPLOAD] details submit started", {
        classId,
        uid6: uid.slice(0, 6),
        uriScheme: pickedImageUri.split(":")[0],
      });
    }
    try {
      const question = await uploadClassQuestionImage({
        uid,
        organizationId,
        classId,
        posterRole: "student",
        localUri: pickedImageUri,
        subject: details.subject,
        description: details.description,
        gradeLevel: details.gradeLevel,
        topic: details.topic,
        choices: details.choices,
        correctChoice: details.correctChoice,
        hints: details.hints,
      });
      if (__DEV__) console.log("[QUESTION_UPLOAD] details submit succeeded", { classId, uid6: uid.slice(0, 6) });
      onUploaded(question);
      setPickedImageUri(null);
    } catch (error) {
      if (__DEV__) {
        const err = error as { name?: unknown; code?: unknown; message?: unknown };
        console.log("[QUESTION_UPLOAD] details submit failed", {
          classId,
          uid6: uid.slice(0, 6),
          errorName: err?.name,
          errorCode: err?.code,
          errorMessage: err?.message,
        });
      }
      setErrorMessage(mapQuestionUploadErrorToMessage(error));
    } finally {
      setIsUploading(false);
      // Released in `finally`, never on success only: a failed upload must
      // leave the button usable so the author can retry (Phase 75 §42).
      submitLock.release();
    }
  }

  return {
    isSourcePickerOpen,
    pickedImageUri,
    isUploading,
    errorMessage,
    openComposer,
    cancelSourcePicker,
    selectImageSource,
    cancelDetails,
    submitDetails,
  };
}
