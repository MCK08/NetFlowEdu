import { useEffect, useState } from "react";

import { getUserPublicQuestions } from "@services/questions/questions";
import { Question } from "@/types/question";

export function usePublicUserQuestions(userId: string | undefined) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setQuestions([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    getUserPublicQuestions(userId)
      .then((result) => {
        if (!cancelled) setQuestions(result);
      })
      .catch(() => {
        if (!cancelled) setQuestions([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { questions, isLoading };
}
