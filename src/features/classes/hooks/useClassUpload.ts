import { useState } from "react";
import { Alert } from "react-native";

import {
  CameraPermissionDeniedError,
  captureAndUploadClassQuestion,
} from "@features/upload/services/uploadService";
import { Question } from "@/types/question";

interface UseClassUploadOptions {
  uid: string | undefined;
  organizationId: string | null;
  classId: string;
  onUploaded: (question: Question) => void;
}

// Same isUploading-guard shape as useUpload, without a visibility picker —
// the class is already fixed by the screen this is used from (see
// TeacherClassDetailScreen), so capture starts immediately on tap.
export function useClassUpload({ uid, organizationId, classId, onUploaded }: UseClassUploadOptions) {
  const [isUploading, setIsUploading] = useState(false);

  async function capture() {
    if (!uid || !organizationId || isUploading) return;
    setIsUploading(true);
    try {
      const question = await captureAndUploadClassQuestion({ uid, organizationId, classId });
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

  return { isUploading, capture };
}
