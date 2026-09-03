import { useCallback, useEffect, useState } from "react";

import { Question } from "@/types/question";

import {
  loadQuestionDetail,
  QUESTION_NOT_FOUND_MESSAGE,
  QuestionDetailFailure,
} from "../services/questionDetailService";

interface QuestionDetailState {
  question: Question | null;
  isLoading: boolean;
  errorMessage: string | null;
  failure: QuestionDetailFailure | null;
  reload: () => void;
}

export function useQuestionDetail(questionId: string | undefined): QuestionDetailState {
  const [question, setQuestion] = useState<Question | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<QuestionDetailFailure | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    // Phase 75 — a route opened without a usable id is "there is no such
    // question", not "loading it failed". It used to leave errorMessage null,
    // which the screen rendered as the generic technical error — announcing a
    // failure that never happened.
    if (!questionId) {
      setQuestion(null);
      setErrorMessage(QUESTION_NOT_FOUND_MESSAGE);
      setFailure("not_found");
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);
    setFailure(null);

    loadQuestionDetail(questionId).then((result) => {
      if (cancelled) return;
      setQuestion(result.question);
      setErrorMessage(result.errorMessage);
      setFailure(result.failure);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [questionId, reloadToken]);

  return { question, isLoading, errorMessage, failure, reload };
}
