import { useRef, useState } from "react";
import { Alert } from "react-native";

import { createAnswerOperationId, submitAnswer } from "../services/answerService";
import {
  answerStatusFeedback,
  mapAnswerSubmissionError,
} from "../services/answerSubmissionMessages";

interface UseDrawingAnswerOptions {
  questionId: string;
  uid: string | undefined;
  onSubmitted: () => void;
}

export function useDrawingAnswer({
  questionId,
  uid,
  onSubmitted,
}: UseDrawingAnswerOptions) {
  const [isUploading, setIsUploading] = useState(false);

  const operationIdRef = useRef<string | null>(null);

  // Held for the LIFETIME of one gesture. A retry after a lost response
  // reuses the same submission, so the server returns the original decision
  // instead of creating a second answer — and does not pay for a second
  // Vision analysis of the same drawing.
  async function save(dataUri: string) {
    if (!uid || isUploading) return;
    setIsUploading(true);
    const operationId = operationIdRef.current ?? createAnswerOperationId();
    operationIdRef.current = operationId;

    try {
      const result = await submitAnswer({
        questionId,
        uid,
        localUri: dataUri,
        method: "drawing",
        operationId,
      });
      operationIdRef.current = null;

      const feedback = answerStatusFeedback(result.status);
      if (result.status !== "published") {
        Alert.alert(feedback.title, feedback.message);
      }
      // A refusal keeps the student on the canvas with their drawing intact
      // rather than discarding work they may have spent real effort on.
      if (feedback.dismiss) onSubmitted();
    } catch (error) {
      Alert.alert("Cevap gönderilemedi.", mapAnswerSubmissionError(error));
    } finally {
      setIsUploading(false);
    }
  }

  return { save, isUploading };
}
