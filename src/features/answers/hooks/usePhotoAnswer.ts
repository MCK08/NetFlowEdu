import * as ImagePicker from "expo-image-picker";
import { useRef, useState } from "react";
import { Alert } from "react-native";


import { createAnswerOperationId, submitAnswer } from "../services/answerService";
import {
  answerStatusFeedback,
  mapAnswerSubmissionError,
} from "../services/answerSubmissionMessages";

interface UsePhotoAnswerOptions {
  questionId: string;
  uid: string | undefined;
  onSubmitted: () => void;
}

export function usePhotoAnswer({
  questionId,
  uid,
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

  // Held for the LIFETIME of one gesture. A retry after a lost response
  // reuses the same submission, so the server returns the original decision
  // instead of creating a second answer — and does not pay for a second
  // Vision analysis of the same photo.
  const operationIdRef = useRef<string | null>(null);

  async function submit() {
    if (!previewUri || !uid || isUploading) return;
    setIsUploading(true);
    const operationId = operationIdRef.current ?? createAnswerOperationId();
    operationIdRef.current = operationId;

    try {
      const result = await submitAnswer({
        questionId,
        uid,
        localUri: previewUri,
        method: "photo",
        operationId,
      });
      operationIdRef.current = null;

      const feedback = answerStatusFeedback(result.status);
      // An approved answer needs no announcement — it appears in the list.
      if (result.status !== "published") {
        Alert.alert(feedback.title, feedback.message);
      }
      // A refusal keeps the student on the screen with their photo, rather
      // than discarding it.
      if (feedback.dismiss) onSubmitted();
    } catch (error) {
      // The id is kept so an explicit retry of THIS gesture stays idempotent.
      Alert.alert("Cevap gönderilemedi.", mapAnswerSubmissionError(error));
    } finally {
      setIsUploading(false);
    }
  }

  return { previewUri, isUploading, pickFromCamera, pickFromGallery, submit };
}
