import { useState } from "react";
import { Alert } from "react-native";

import { Question } from "@/types/question";

import { CameraPermissionDeniedError, captureAndUploadQuestion } from "../services/uploadService";

interface UseUploadOptions {
  uid: string | undefined;
  organizationId: string | null;
  onUploaded: (question: Question) => void;
}

export function useUpload({ uid, organizationId, onUploaded }: UseUploadOptions) {
  const [isUploading, setIsUploading] = useState(false);

  async function capture() {
    if (!uid || isUploading) return;

    setIsUploading(true);
    try {
      const question = await captureAndUploadQuestion({ uid, organizationId });
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

  return { capture, isUploading };
}
