import { useEffect, useState } from "react";
import { Alert, Keyboard } from "react-native";

import { createComment, deleteComment, subscribeToQuestionComments } from "@services/questions/comments";
import { QuestionComment } from "@/types/comment";

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
    try {
      await createComment({
        questionId,
        ownerId: uid,
        text: normalizeCommentText(draft),
      });
      setDraft("");
      Keyboard.dismiss();
    } catch {
      Alert.alert("Yorum gönderilemedi.", "Lütfen tekrar deneyin.");
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
