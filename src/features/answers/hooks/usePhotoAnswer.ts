import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Alert } from "react-native";

import { auth } from "@services/firebase/config";

import { AnswerUploadStageError, submitAnswer } from "../services/answerService";

interface UsePhotoAnswerOptions {
  questionId: string;
  uid: string | undefined;
  onSubmitted: () => void;
}

export function usePhotoAnswer({ questionId, uid, onSubmitted }: UsePhotoAnswerOptions) {
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

    // TEMPORARY diagnostic instrumentation — remove once the Expo Go
    // answer-upload bug is confirmed fixed.
    if (__DEV__) {
      console.log("[ANSWER_UPLOAD] save button pressed (photo)");
      console.log("[ANSWER_UPLOAD] authenticated user exists", Boolean(auth.currentUser));
    }

    setIsUploading(true);
    try {
      await submitAnswer({ questionId, uid, localUri: previewUri, method: "photo" });

      if (__DEV__) console.log("[ANSWER_UPLOAD] navigation started");
      onSubmitted();
      if (__DEV__) console.log("[ANSWER_UPLOAD] navigation completed");
    } catch (error) {
      const stage = error instanceof AnswerUploadStageError ? error.stage : "unknown";
      const cause = error instanceof AnswerUploadStageError ? error.cause : error;

      if (__DEV__) {
        const err = cause as { constructor?: { name?: string }; code?: unknown; message?: unknown; stack?: unknown };
        console.log("[ANSWER_UPLOAD] catch: stage", stage);
        console.log("[ANSWER_UPLOAD] catch: error.constructor.name", err?.constructor?.name);
        console.log("[ANSWER_UPLOAD] catch: error.code", err?.code);
        console.log("[ANSWER_UPLOAD] catch: error.message", err?.message);
        console.log("[ANSWER_UPLOAD] catch: error.stack", err?.stack);
        console.log("[ANSWER_UPLOAD] catch: full error object", cause);
      }

      // TEMPORARY: surfaces stage + raw error code so it can be read
      // directly off the device without a debugger attached. Revert to the
      // generic Turkish message once the bug is fixed.
      const code = (cause as { code?: string } | null)?.code ?? "unknown";
      Alert.alert("Yükleme başarısız", `Cevap kaydedilemedi. Aşama: ${stage}. Hata kodu: ${code}`);
    } finally {
      setIsUploading(false);
    }
  }

  return { previewUri, isUploading, pickFromCamera, pickFromGallery, submit };
}
