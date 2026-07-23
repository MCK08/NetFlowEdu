import { useState } from "react";
import { Alert } from "react-native";

import { Question, QuestionVisibility } from "@/types/question";

import { CameraPermissionDeniedError, captureAndUploadQuestion } from "../services/uploadService";

interface UseUploadOptions {
  uid: string | undefined;
  organizationId: string | null;
  onUploaded: (question: Question) => void;
}

// Tapping the camera button first opens a visibility picker (see
// VisibilityPicker) rather than launching the camera directly — the
// question needs a chosen visibility before its Storage path can be built
// (see uploadQuestionImage), so the choice has to happen before capture,
// not after.
export function useUpload({ uid, organizationId, onUploaded }: UseUploadOptions) {
  const [isUploading, setIsUploading] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  function openPicker() {
    if (!uid || isUploading) return;
    setIsPickerOpen(true);
  }

  function closePicker() {
    setIsPickerOpen(false);
  }

  // Called by VisibilityPicker's onSelect only after its own close
  // animation has actually finished and it has unmounted itself (see
  // VisibilityPicker.tsx) — no picker UI, native or otherwise, exists by
  // the time this runs, so there is nothing for launchCameraAsync's
  // presentation to race against.
  async function captureWithVisibility(visibility: QuestionVisibility) {
    setIsPickerOpen(false);
    if (!uid || isUploading) return;

    if (__DEV__) console.log("[QUESTION_UPLOAD] captureWithVisibility called", visibility);

    setIsUploading(true);
    try {
      if (__DEV__) console.log("[QUESTION_UPLOAD] captureAndUploadQuestion called");
      const question = await captureAndUploadQuestion({ uid, organizationId, visibility });
      if (__DEV__) console.log("[QUESTION_UPLOAD] captureAndUploadQuestion returned", question ? "question" : "null");
      if (question) {
        onUploaded(question);
      }
    } catch (error) {
      if (__DEV__) {
        const err = error as { constructor?: { name?: string }; code?: unknown; message?: unknown; stack?: unknown };
        console.log("[QUESTION_UPLOAD] catch: error.constructor.name", err?.constructor?.name);
        console.log("[QUESTION_UPLOAD] catch: error.code", err?.code);
        console.log("[QUESTION_UPLOAD] catch: error.message", err?.message);
        console.log("[QUESTION_UPLOAD] catch: error.stack", err?.stack);
        console.log("[QUESTION_UPLOAD] catch: full error object", error);
      }
      if (error instanceof CameraPermissionDeniedError) {
        Alert.alert(
          "Kamera izni gerekli",
          "Soru fotoğrafı çekebilmek için kamera erişimine izin vermelisiniz. Ayarlar üzerinden izni etkinleştirebilirsiniz.",
        );
      } else {
        Alert.alert("Yükleme başarısız", "Fotoğraf yüklenirken bir hata oluştu. Lütfen tekrar deneyin.");
      }
    } finally {
      if (__DEV__) console.log("[QUESTION_UPLOAD] finally: setIsUploading(false)");
      setIsUploading(false);
    }
  }

  return { isUploading, isPickerOpen, openPicker, closePicker, captureWithVisibility };
}
