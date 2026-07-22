import { useCallback, useEffect, useState } from "react";

import { Question } from "@/types/question";

import { loadQuestionDetail } from "../services/questionDetailService";

interface QuestionDetailState {
  question: Question | null;
  isLoading: boolean;
  errorMessage: string | null;
  reload: () => void;
}

export function useQuestionDetail(questionId: string | undefined): QuestionDetailState {
  const [question, setQuestion] = useState<Question | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    if (!questionId) {
      setQuestion(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);

    loadQuestionDetail(questionId).then((result) => {
      if (cancelled) return;
      setQuestion(result.question);
      setErrorMessage(result.errorMessage);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [questionId, reloadToken]);

  return { question, isLoading, errorMessage, reload };
}
