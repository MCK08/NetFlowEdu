import { useState } from "react";
import { Alert } from "react-native";

import { auth } from "@services/firebase/config";

import { AnswerUploadStageError, submitAnswer } from "../services/answerService";

interface UseDrawingAnswerOptions {
  questionId: string;
  uid: string | undefined;
  onSubmitted: () => void;
}

export function useDrawingAnswer({ questionId, uid, onSubmitted }: UseDrawingAnswerOptions) {
  const [isUploading, setIsUploading] = useState(false);

  async function save(dataUri: string) {
    if (!uid || isUploading) return;

    // TEMPORARY diagnostic instrumentation — remove once the Expo Go
    // answer-upload bug is confirmed fixed.
    if (__DEV__) {
      console.log("[ANSWER_UPLOAD] save button pressed (drawing)");
      console.log("[ANSWER_UPLOAD] authenticated user exists", Boolean(auth.currentUser));
    }

    setIsUploading(true);
    try {
      await submitAnswer({ questionId, uid, localUri: dataUri, method: "drawing" });

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

  return { save, isUploading };
}
