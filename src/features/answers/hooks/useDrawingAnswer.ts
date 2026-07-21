import { useState } from "react";
import { Alert } from "react-native";

import { submitAnswer } from "../services/answerService";

interface UseDrawingAnswerOptions {
  questionId: string;
  uid: string | undefined;
  onSubmitted: () => void;
}

export function useDrawingAnswer({ questionId, uid, onSubmitted }: UseDrawingAnswerOptions) {
  const [isUploading, setIsUploading] = useState(false);

  async function save(dataUri: string) {
    if (!uid || isUploading) return;
    setIsUploading(true);
    try {
      await submitAnswer({ questionId, uid, localUri: dataUri, method: "drawing" });
      onSubmitted();
    } catch {
      Alert.alert("Yükleme başarısız", "Çizim yüklenirken bir hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      setIsUploading(false);
    }
  }

  return { save, isUploading };
}
