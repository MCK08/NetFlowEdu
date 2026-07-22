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

    // TEMPORARY diagnostic instrumentation — remove once the production-
    // device drawing-save bug is confirmed fixed.
    if (__DEV__) {
      console.log("[DRAWING] questionId", questionId);
      console.log("[DRAWING] authenticated uid exists", Boolean(uid));
    }

    setIsUploading(true);
    try {
      await submitAnswer({ questionId, uid, localUri: dataUri, method: "drawing" });
      onSubmitted();
    } catch (error) {
      if (__DEV__) {
        const err = error as { constructor?: { name?: string }; code?: unknown; message?: unknown; stack?: unknown };
        console.log("[DRAWING] catch: error.constructor.name", err?.constructor?.name);
        console.log("[DRAWING] catch: error.code", err?.code);
        console.log("[DRAWING] catch: error.message", err?.message);
        console.log("[DRAWING] catch: error.stack", err?.stack);
        console.log("[DRAWING] catch: full error object", error);
      }

      // TEMPORARY: surfaces the raw error code in the user-facing alert so
      // it can be read directly off the device without a debugger attached.
      // Revert to the generic Turkish message once the bug is fixed.
      const code = (error as { code?: string } | null)?.code ?? "unknown";
      Alert.alert("Yükleme başarısız", `Çizim kaydedilemedi. Hata kodu: ${code}`);
    } finally {
      setIsUploading(false);
    }
  }

  return { save, isUploading };
}
