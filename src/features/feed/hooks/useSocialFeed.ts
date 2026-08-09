import { useCallback, useEffect, useRef, useState } from "react";

import {
  FeedCursorState,
  INITIAL_FEED_CURSOR_STATE,
  loadNextFeedPage,
  shouldApplyFeedPageResult,
} from "../services/socialFeedService";
import { Question } from "../types";

export function useSocialFeed(uid: string | undefined) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs, not state: pagination cursors/seen-ids don't need to trigger a
  // re-render themselves, and keeping them in refs means loadMore() always
  // reads the latest value without needing to be in its own dependency
  // array (which would otherwise recreate the callback every page).
  const cursorRef = useRef<FeedCursorState>(INITIAL_FEED_CURSOR_STATE);
  const seenIdsRef = useRef<Set<string>>(new Set());
  // Bumped on every reset (mount/uid-change/refresh) so an in-flight
  // loadMore() from a previous "generation" can detect it's stale and
  // discard its result instead of appending onto a feed that's since been
  // cleared out from under it.
  const generationRef = useRef(0);

  const loadFirstPage = useCallback(
    async (mode: "initial" | "refresh") => {
      if (!uid) return;
      const generation = ++generationRef.current;
      cursorRef.current = INITIAL_FEED_CURSOR_STATE;
      seenIdsRef.current = new Set();

      if (mode === "initial") setIsLoading(true);
      else setIsRefreshing(true);
      setError(null);

      try {
        const result = await loadNextFeedPage(uid, cursorRef.current, seenIdsRef.current);
        if (generation !== generationRef.current) return;
        cursorRef.current = result.nextState;
        setQuestions(result.questions);
      } catch {
        if (generation !== generationRef.current) return;
        setError("Akış yüklenemedi.");
      } finally {
        if (generation !== generationRef.current) return;
        if (mode === "initial") setIsLoading(false);
        else setIsRefreshing(false);
      }
    },
    [uid],
  );

  useEffect(() => {
    loadFirstPage("initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const loadMore = useCallback(async () => {
    if (!uid || isLoadingMore || cursorRef.current.phase === "done") return;
    const generation = generationRef.current;
    setIsLoadingMore(true);
    try {
      const result = await loadNextFeedPage(uid, cursorRef.current, seenIdsRef.current);
      if (shouldApplyFeedPageResult(generation, generationRef.current)) {
        cursorRef.current = result.nextState;
        if (result.questions.length > 0) {
          setQuestions((prev) => [...prev, ...result.questions]);
        }
      }
    } catch {
      if (generation === generationRef.current) setError("Akış yüklenemedi.");
    } finally {
      // Unconditional, unlike the two generation-gated writes above: a
      // refresh() firing while this loadMore() is in flight bumps
      // generationRef, and gating this reset the same way left
      // isLoadingMore stuck true forever once that happened — the guard at
      // the top of this function then blocked every future loadMore call
      // (onEndReached, the pagination-retry button) for the rest of the
      // session. Resetting the flag is always correct regardless of
      // generation: this call's own fetch is done either way, and nothing
      // else can have set isLoadingMore true in the meantime (loadMore
      // itself was blocked from starting a second time by this same flag).
      setIsLoadingMore(false);
    }
  }, [uid, isLoadingMore]);

  const refresh = useCallback(() => loadFirstPage("refresh"), [loadFirstPage]);

  // Called after a successful upload so the new question appears without
  // waiting for a manual pull-to-refresh.
  const prepend = useCallback((question: Question) => {
    seenIdsRef.current.add(question.id);
    setQuestions((prev) => [question, ...prev]);
  }, []);

  return {
    questions,
    isLoading,
    isLoadingMore,
    isRefreshing,
    error,
    hasMore: cursorRef.current.phase !== "done",
    loadMore,
    refresh,
    prepend,
  };
}
