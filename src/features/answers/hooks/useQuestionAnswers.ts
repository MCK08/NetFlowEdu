import { useEffect, useState } from "react";

import { subscribeToAnswersForQuestion } from "../services/answerQueryService";
import { Answer } from "../types";

interface QuestionAnswersState {
  answers: Answer[];
  isLoading: boolean;
  error: string | null;
}

const PERMISSION_DENIED_MESSAGE = "Bu sorunun cevaplarını görüntüleme yetkiniz yok.";
const GENERIC_ERROR_MESSAGE = "Cevaplar yüklenirken bir hata oluştu.";

// Real-time answer list for a single question. Re-subscribes only when
// questionId changes (not on every render) so there is never more than one
// live listener per mounted screen, and always unsubscribes on unmount or
// questionId change — the returned cleanup from onSnapshot is the only
// thing that ever tears the listener down.
export function useQuestionAnswers(questionId: string | undefined): QuestionAnswersState {
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!questionId) {
      setAnswers([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const unsubscribe = subscribeToAnswersForQuestion(
      questionId,
      (next) => {
        setAnswers(next);
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

  return { answers, isLoading, error };
}
