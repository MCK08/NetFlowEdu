import { useCallback, useEffect, useRef, useState } from "react";
import { DocumentData, DocumentSnapshot } from "firebase/firestore";

import { getOwnQuestionsPage } from "@services/questions/questions";
import { getSavedQuestionsPage } from "@services/questions/savedQuestions";
import { Question } from "@/types/question";

export type ArchiveMode = "own" | "saved";

const PAGE_SIZE = 24;

function fetchPage(mode: ArchiveMode, uid: string, cursor: DocumentSnapshot<DocumentData> | null) {
  return mode === "own"
    ? getOwnQuestionsPage(uid, PAGE_SIZE, cursor)
    : getSavedQuestionsPage(uid, PAGE_SIZE, cursor);
}

// Backs both Profile archive sections ("Sorularım" / "Kaydettiklerim") —
// same cursor-based pagination shape as useSocialFeed, single page source
// selected by `mode` instead of a merged multi-source feed.
export function useQuestionArchive(uid: string | undefined, mode: ArchiveMode) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const cursorRef = useRef<DocumentSnapshot<DocumentData> | null>(null);
  const hasMoreRef = useRef(true);
  const generationRef = useRef(0);

  const load = useCallback(async () => {
    const generation = ++generationRef.current;
    cursorRef.current = null;
    hasMoreRef.current = true;

    if (!uid) {
      setQuestions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const page = await fetchPage(mode, uid, null);
      if (generation !== generationRef.current) return;
      setQuestions(page.questions);
      cursorRef.current = page.cursor;
      hasMoreRef.current = page.hasMore;
    } catch {
      if (generation === generationRef.current) setQuestions([]);
    } finally {
      if (generation === generationRef.current) setIsLoading(false);
    }
  }, [uid, mode]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!uid || isLoadingMore || !hasMoreRef.current) return;
    const generation = generationRef.current;
    setIsLoadingMore(true);
    try {
      const page = await fetchPage(mode, uid, cursorRef.current);
      if (generation !== generationRef.current) return;
      if (page.questions.length > 0) {
        setQuestions((prev) => [...prev, ...page.questions]);
      }
      cursorRef.current = page.cursor;
      hasMoreRef.current = page.hasMore;
    } catch {
      // Silent — user can retry by scrolling again.
    } finally {
      if (generation === generationRef.current) setIsLoadingMore(false);
    }
  }, [uid, mode, isLoadingMore]);

  return {
    questions,
    isLoading,
    isLoadingMore,
    hasMore: hasMoreRef.current,
    loadMore,
  };
}
