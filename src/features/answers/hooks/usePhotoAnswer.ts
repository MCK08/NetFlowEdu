import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Alert } from "react-native";

import { QuestionVisibility } from "@/types/question";

import { submitAnswer } from "../services/answerService";

interface UsePhotoAnswerOptions {
  questionId: string;
  uid: string | undefined;
  questionVisibility: QuestionVisibility;
  onSubmitted: () => void;
}

export function usePhotoAnswer({
  questionId,
  uid,
  questionVisibility,
  onSubmitted,
}: UsePhotoAnswerOptions) {
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function pickFromCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Kamera izni gerekli",
        "Fotoğraf çekebilmek için kamera erişimine izin vermelisiniz.",
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (!result.canceled && result.assets[0]) {
      setPreviewUri(result.assets[0].uri);
    }
  }

  async function pickFromGallery() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Galeri izni gerekli",
        "Fotoğraf seçebilmek için galeri erişimine izin vermelisiniz.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setPreviewUri(result.assets[0].uri);
    }
  }

  async function submit() {
    if (!previewUri || !uid || isUploading) return;
    setIsUploading(true);
    try {
      await submitAnswer({
        questionId,
        uid,
        localUri: previewUri,
        method: "photo",
        questionVisibility,
      });
      onSubmitted();
    } catch {
      Alert.alert("Yükleme başarısız", "Cevap yüklenirken bir hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      setIsUploading(false);
    }
  }

  return { previewUri, isUploading, pickFromCamera, pickFromGallery, submit };
}
