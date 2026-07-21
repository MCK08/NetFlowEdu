import { useCallback, useEffect, useState } from "react";

import { loadFeed } from "../services/feedService";
import { Question } from "../types";

export function useFeed(uid: string | undefined) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      if (!uid) return;
      if (mode === "initial") {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }
      setError(null);
      try {
        const next = await loadFeed(uid);
        setQuestions(next);
      } catch {
        setError("Sorular yüklenirken bir hata oluştu.");
      } finally {
        if (mode === "initial") {
          setIsLoading(false);
        } else {
          setIsRefreshing(false);
        }
      }
    },
    [uid],
  );

  useEffect(() => {
    load("initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const refresh = useCallback(() => load("refresh"), [load]);

  // Called after a successful upload so the new question appears without
  // waiting for a manual pull-to-refresh.
  const prepend = useCallback((question: Question) => {
    setQuestions((prev) => [question, ...prev]);
  }, []);

  return { questions, isLoading, isRefreshing, error, refresh, prepend };
}
