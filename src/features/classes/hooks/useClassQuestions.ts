import { useCallback, useEffect, useRef, useState } from "react";
import { DocumentData, DocumentSnapshot } from "firebase/firestore";

import { getClassQuestionsPage } from "@services/questions/questions";
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

  const load = useCallback(async () => {
    const generation = ++generationRef.current;
    cursorRef.current = null;
    hasMoreRef.current = true;

    if (!classId) {
      setQuestions([]);
      setIsLoading(false);
      return;
    }

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
      if (generation === generationRef.current) setIsLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!classId || isLoadingMore || !hasMoreRef.current) return;
    const generation = generationRef.current;
    setIsLoadingMore(true);
    try {
      const page = await getClassQuestionsPage(classId, PAGE_SIZE, cursorRef.current);
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
  }, [classId, isLoadingMore]);

  const prepend = useCallback((question: Question) => {
    setQuestions((prev) => [question, ...prev]);
  }, []);

  return { questions, isLoading, isLoadingMore, hasMore: hasMoreRef.current, loadMore, prepend };
}
