import { FirebaseError } from "firebase/app";
import { DocumentData, DocumentSnapshot } from "firebase/firestore";
import { useCallback, useEffect, useRef, useState } from "react";

import { getClassQuestionsPage } from "@services/questions/questions";
import { Question } from "@/types/question";

import {
  dedupeQuestionsById,
  mergeQuestionPages,
  reinjectQuestionForSecondChance,
  restoreActiveIndex,
  shouldPrefetchNextPage,
} from "../services/classFeedPagination";

// Smaller than the 24-item grid page: each feed item is a full-screen image,
// so a big first page costs bandwidth for cards the student may never reach.
const PAGE_SIZE = 8;

// Start fetching while this many cards are still ahead of the active one, so
// the network round-trip overlaps with reading instead of stalling the swipe.
const PREFETCH_THRESHOLD = 3;

function errorCodeOf(error: unknown): string {
  if (error instanceof FirebaseError) return error.code;
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "unknown";
}

// Cursor-paginated question feed for exactly ONE class.
//
// Reuses getClassQuestionsPage (the same query the class grid already uses,
// and the same one proven against the rules emulator in
// firestore.rules.test.ts's "getClassQuestionsPage LIST query" block) rather
// than introducing a second query shape — a different shape would need its
// own index and its own provability proof.
//
// Never fetches the whole class and slices locally: `hasMore` and the
// Firestore cursor come straight from the server page.
export function useClassFeed(classId: string | undefined) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const cursorRef = useRef<DocumentSnapshot<DocumentData> | null>(null);
  // Synchronous in-flight guard. isLoadingMore is React state and only
  // becomes true on the next render, so rapid swipes could otherwise fire
  // several identical page requests — each advancing the shared cursor and
  // silently skipping questions.
  const fetchingRef = useRef(false);
  // Invalidates responses that resolve after the classId changed or a
  // refresh restarted the feed.
  const generationRef = useRef(0);
  // Read inside loadMore without making it a dependency (which would
  // recreate the callback on every swipe and defeat memoization).
  const questionsRef = useRef<Question[]>([]);
  questionsRef.current = questions;
  const hasMoreRef = useRef(true);
  hasMoreRef.current = hasMore;

  const load = useCallback(async () => {
    const generation = ++generationRef.current;
    cursorRef.current = null;
    fetchingRef.current = false;

    if (!classId) {
      setQuestions([]);
      setHasMore(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorCode(null);
    try {
      const page = await getClassQuestionsPage(classId, PAGE_SIZE, null);
      if (generation !== generationRef.current) return;
      setQuestions(dedupeQuestionsById(page.questions));
      cursorRef.current = page.cursor;
      setHasMore(page.hasMore);
      setActiveIndex(0);
    } catch (error) {
      if (generation !== generationRef.current) return;
      const code = errorCodeOf(error);
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.warn("[classFeed] initial load failed", {
          op: "getClassQuestionsPage",
          classId6: classId.slice(0, 6),
          code,
        });
      }
      setErrorCode(code);
      setQuestions([]);
      setHasMore(false);
    } finally {
      if (generation === generationRef.current) setIsLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!classId) return;
    if (fetchingRef.current) return;
    if (!hasMoreRef.current) return;

    fetchingRef.current = true;
    const generation = generationRef.current;
    setIsLoadingMore(true);
    try {
      const page = await getClassQuestionsPage(classId, PAGE_SIZE, cursorRef.current);
      if (generation !== generationRef.current) return;
      // Merge (not append) — overlapping cursor pages must never render the
      // same question twice or corrupt the "n / total" counter.
      setQuestions((prev) => mergeQuestionPages(prev, page.questions));
      cursorRef.current = page.cursor;
      setHasMore(page.hasMore);
    } catch (error) {
      if (generation !== generationRef.current) return;
      const code = errorCodeOf(error);
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.warn("[classFeed] pagination failed", {
          op: "getClassQuestionsPage",
          classId6: classId.slice(0, 6),
          code,
        });
      }
      // Pagination failure never blanks the questions already on screen —
      // it only stops further auto-fetching, and surfaces a retryable error.
      setErrorCode(code);
      setHasMore(false);
    } finally {
      if (generation === generationRef.current) setIsLoadingMore(false);
      fetchingRef.current = false;
    }
  }, [classId]);

  // Called by the screen whenever the active card changes. Keeps prefetch
  // decisions in one place instead of scattering them through the view.
  const onActiveIndexChange = useCallback(
    (index: number) => {
      setActiveIndex(index);
      if (
        shouldPrefetchNextPage({
          activeIndex: index,
          loadedCount: questionsRef.current.length,
          hasMore: hasMoreRef.current,
          isFetching: fetchingRef.current,
          threshold: PREFETCH_THRESHOLD,
        })
      ) {
        loadMore();
      }
    },
    [loadMore],
  );

  // Re-reads the first page while keeping the student on the question they
  // were reading (matched by id), so a pull-to-refresh never yanks them
  // back to the top.
  const refresh = useCallback(async () => {
    if (!classId) return;
    const anchorId = questionsRef.current[activeIndex]?.id;
    const anchorIndex = activeIndex;
    const generation = ++generationRef.current;
    cursorRef.current = null;
    fetchingRef.current = false;
    setErrorCode(null);
    try {
      const page = await getClassQuestionsPage(classId, PAGE_SIZE, null);
      if (generation !== generationRef.current) return;
      const next = dedupeQuestionsById(page.questions);
      setQuestions(next);
      cursorRef.current = page.cursor;
      setHasMore(page.hasMore);
      setActiveIndex(restoreActiveIndex(next, anchorId, anchorIndex));
    } catch (error) {
      if (generation !== generationRef.current) return;
      const code = errorCodeOf(error);
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.warn("[classFeed] refresh failed", {
          op: "getClassQuestionsPage",
          classId6: classId.slice(0, 6),
          code,
        });
      }
      setErrorCode(code);
    }
  }, [classId, activeIndex]);

  // Phase 18 — splices a struggled question back into THIS session's local
  // array for its one "second chance" reshow (see classFeedStudyGating.ts /
  // classFeedPagination.ts's reinjectQuestionForSecondChance for the actual
  // rule). Purely a local array mutation — no network call, no schema
  // change, nothing persisted. `questionsRef` (not `questions`) is read so
  // this stays referentially stable across renders like `loadMore` above.
  const reinjectForSecondChance = useCallback((question: Question, insertIndex: number) => {
    setQuestions((prev) => reinjectQuestionForSecondChance(prev, question, insertIndex));
  }, []);

  return {
    questions,
    isLoading,
    isLoadingMore,
    hasMore,
    errorCode,
    activeIndex,
    onActiveIndexChange,
    loadMore,
    refresh,
    retry: load,
    reinjectForSecondChance,
  };
}
