import { useCallback, useEffect, useRef, useState } from "react";
import { DocumentData, DocumentSnapshot } from "firebase/firestore";

import { getClassQuestionsPage } from "@services/questions/questions";
import { dedupeQuestionsById } from "@features/classes/services/classFeedPagination";
import { Question } from "@/types/question";

const PAGE_SIZE = 24;

// Same cursor-based pagination shape as useQuestionArchive/useSocialFeed —
// a single class's own question archive (the "Sınıf" feed section).
export function useClassQuestions(classId: string | undefined) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const cursorRef = useRef<DocumentSnapshot<DocumentData> | null>(null);
  const hasMoreRef = useRef(true);
  const generationRef = useRef(0);
  // Phase 103 — found on the simulator: a short list reaches its end on first
  // render, so FlatList fires onEndReached while the FIRST page is still in
  // flight. The cursor is still null then, so loadMore fetched page 1 a second
  // time and appended it — every question rendered twice and React reported
  // duplicate keys. Paging now waits for the first page, and appends are
  // de-duplicated by id as a second line of defence.
  const initialLoadInFlightRef = useRef(false);

  const load = useCallback(async () => {
    const generation = ++generationRef.current;
    cursorRef.current = null;
    hasMoreRef.current = true;

    if (!classId) {
      initialLoadInFlightRef.current = false;
      setQuestions([]);
      setIsLoading(false);
      return;
    }

    initialLoadInFlightRef.current = true;
    setIsLoading(true);
    try {
      const page = await getClassQuestionsPage(classId, PAGE_SIZE, null);
      if (generation !== generationRef.current) return;
      setQuestions(page.questions);
      cursorRef.current = page.cursor;
      hasMoreRef.current = page.hasMore;
    } catch {
      if (generation === generationRef.current) setQuestions([]);
    } finally {
      if (generation === generationRef.current) {
        initialLoadInFlightRef.current = false;
        setIsLoading(false);
      }
    }
  }, [classId]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!classId || isLoadingMore || !hasMoreRef.current || initialLoadInFlightRef.current) return;
    const generation = generationRef.current;
    setIsLoadingMore(true);
    try {
      const page = await getClassQuestionsPage(classId, PAGE_SIZE, cursorRef.current);
      if (generation !== generationRef.current) return;
      if (page.questions.length > 0) {
        setQuestions((prev) => dedupeQuestionsById([...prev, ...page.questions]));
      }
      cursorRef.current = page.cursor;
      hasMoreRef.current = page.hasMore;
    } catch {
      // Silent — user can retry by scrolling again.
    } finally {
      if (generation === generationRef.current) setIsLoadingMore(false);
    }
  }, [classId, isLoadingMore]);

  const prepend = useCallback((question: Question) => {
    setQuestions((prev) => dedupeQuestionsById([question, ...prev]));
  }, []);

  return { questions, isLoading, isLoadingMore, hasMore: hasMoreRef.current, loadMore, prepend };
}
