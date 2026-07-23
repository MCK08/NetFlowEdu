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

  async function captureWithVisibility(visibility: QuestionVisibility) {
    setIsPickerOpen(false);
    if (!uid || isUploading) return;

    setIsUploading(true);
    try {
      const question = await captureAndUploadQuestion({ uid, organizationId, visibility });
      if (question) {
        onUploaded(question);
      }
    } catch (error) {
      if (error instanceof CameraPermissionDeniedError) {
        Alert.alert(
          "Kamera izni gerekli",
          "Soru fotoğrafı çekebilmek için kamera erişimine izin vermelisiniz. Ayarlar üzerinden izni etkinleştirebilirsiniz.",
        );
      } else {
        Alert.alert("Yükleme başarısız", "Fotoğraf yüklenirken bir hata oluştu. Lütfen tekrar deneyin.");
      }
    } finally {
      setIsUploading(false);
    }
  }

  return { isUploading, isPickerOpen, openPicker, closePicker, captureWithVisibility };
}
