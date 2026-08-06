import { useEffect, useRef, useState } from "react";
import { Alert, Keyboard } from "react-native";

import { deleteComment, subscribeToQuestionComments } from "@services/questions/comments";
import { QuestionComment } from "@/types/comment";

import {
  createCommentOperationId,
  submitCommentForModeration,
} from "../services/commentSubmission";
import {
  commentStatusFeedback,
  mapCommentSubmissionError,
} from "../services/commentSubmissionMessages";
import { normalizeCommentText, validateCommentText } from "../services/commentValidation";

const PERMISSION_DENIED_MESSAGE = "Bu sorunun yorumlarını görüntüleme yetkiniz yok.";
const GENERIC_ERROR_MESSAGE = "Yorumlar yüklenirken bir hata oluştu.";

interface UseQuestionCommentsOptions {
  questionId: string | undefined;
  uid: string | undefined;
}

// Real-time comment list, oldest first — re-subscribes only when
// questionId changes, always cleaned up on unmount/change, same pattern as
// useQuestionAnswers.
export function useQuestionComments({ questionId, uid }: UseQuestionCommentsOptions) {
  const [comments, setComments] = useState<QuestionComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const operationIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!questionId) {
      setComments([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const unsubscribe = subscribeToQuestionComments(
      questionId,
      (next) => {
        setComments(next);
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        setIsLoading(false);
        const code = (err as { code?: string }).code;
        setError(code === "permission-denied" ? PERMISSION_DENIED_MESSAGE : GENERIC_ERROR_MESSAGE);
      },
    );

    return unsubscribe;
  }, [questionId]);

  async function submit() {
    if (!questionId || !uid || isSubmitting) return;

    const validationError = validateCommentText(draft);
    if (validationError) {
      Alert.alert("Yorum gönderilemedi.", validationError);
      return;
    }

    setIsSubmitting(true);
    // Held for the LIFETIME of one gesture, so a retry after a lost response
    // reuses it and the backend returns the original submission instead of
    // creating a second one. Cleared on success, so a genuinely new press
    // mints a new id. Same shape as the study feature's gesture identity.
    const operationId = operationIdRef.current ?? createCommentOperationId();
    operationIdRef.current = operationId;

    try {
      const result = await submitCommentForModeration(
        questionId,
        normalizeCommentText(draft),
        operationId,
      );
      operationIdRef.current = null;

      const feedback = commentStatusFeedback(result.status);
      if (feedback.clearDraft) {
        setDraft("");
        Keyboard.dismiss();
      }
      // An approved comment needs no announcement — it simply appears in the
      // live list. Anything else does, because nothing visible happened, and
      // a refusal keeps the draft so the student can edit rather than lose it.
      if (result.status !== "published") {
        Alert.alert(feedback.title, feedback.message);
      }
    } catch (error) {
      // The id is deliberately kept: an explicit retry of THIS gesture must
      // stay idempotent.
      Alert.alert("Yorum gönderilemedi.", mapCommentSubmissionError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function remove(commentId: string) {
    try {
      await deleteComment(commentId);
    } catch {
      Alert.alert("Yorum silinemedi.", "Lütfen tekrar deneyin.");
    }
  }

  return { comments, isLoading, error, draft, setDraft, isSubmitting, submit, remove };
}
