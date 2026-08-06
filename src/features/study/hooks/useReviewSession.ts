import { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";
import { useCallback, useEffect, useRef, useState } from "react";

import { StudyOutcome } from "../domain/studyTypes";
import { GestureOperation, resolveGestureOperation } from "../services/gestureOperationId";
import { mapStudyErrorToMessage } from "../services/studyErrorMapper";
import {
  DEFAULT_QUEUE_PAGE_SIZE,
  getDueStudyItemsPage,
  recordStudyOutcome,
  removeStudyItem as removeStudyItemRemote,
  resolveQueueEntries,
  ResolvedQueueEntry,
} from "../services/studyService";
import { mergeResolvedPages, removeStudyItemById } from "../services/studyQueueMerge";

export interface SessionTotals {
  reviewed: number;
  solved: number;
  struggled: number;
  again: number;
}

const EMPTY_TOTALS: SessionTotals = { reviewed: 0, solved: 0, struggled: 0, again: 0 };

// Owns one review session end to end: cursor-paginated loading, the current
// card, auto-advance, per-gesture idempotency, and the running totals the
// summary screen shows.
export function useReviewSession(uid: string | undefined) {
  const [entries, setEntries] = useState<ResolvedQueueEntry[]>([]);
  const [index, setIndex] = useState(0);
  const [totals, setTotals] = useState<SessionTotals>(EMPTY_TOTALS);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [paginationError, setPaginationError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Which outcome is mid-flight — drives the per-button spinner. `null` when
  // idle, or when the in-flight action isn't an outcome (e.g. a removal).
  const [pendingOutcome, setPendingOutcome] = useState<StudyOutcome | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isComplete, setIsComplete] = useState(false);

  const cursorRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  // Bumped on every fresh session start; a stale in-flight response from a
  // previous generation is discarded rather than overwriting newer state.
  const generationRef = useRef(0);
  const inFlightRef = useRef(false);
  // Held for the whole duration of a mutation so a rapid double-tap issues
  // exactly one call (the backend operationId is the second line of defence).
  const submitLockRef = useRef(false);
  // One operationId per LOGICAL gesture — identified by (questionId, outcome).
  //
  // Minting a fresh id on every submitOutcome call was wrong: after a failure
  // the student stays on the same card and presses again, and if the original
  // response was merely lost in transit a new id would record a SECOND review
  // for one question. Keying on the outcome too is what keeps "retry" and
  // "changed my mind" distinct: pressing the SAME button again is the same
  // gesture and must collapse, pressing a DIFFERENT one is a new decision and
  // must be recorded. Cleared on success. Mirrors useStudyQuestionState.
  const operationRef = useRef<GestureOperation | null>(null);
  const activeUidRef = useRef(uid);
  activeUidRef.current = uid;

  const loadFirstPage = useCallback(async () => {
    if (!uid) {
      setIsLoading(false);
      return;
    }
    const generation = ++generationRef.current;
    cursorRef.current = null;
    setIsLoading(true);
    setLoadError(null);
    setIsComplete(false);
    setIndex(0);
    setTotals(EMPTY_TOTALS);

    try {
      const page = await getDueStudyItemsPage(uid, Date.now(), DEFAULT_QUEUE_PAGE_SIZE, null);
      const resolved = await resolveQueueEntries(page.items);
      if (generationRef.current !== generation || activeUidRef.current !== uid) return;
      setEntries(resolved);
      cursorRef.current = page.cursor;
      setHasMore(page.hasMore);
    } catch (error) {
      if (generationRef.current !== generation) return;
      setLoadError(mapStudyErrorToMessage(error));
    } finally {
      if (generationRef.current === generation) setIsLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  const loadMore = useCallback(async () => {
    // In-flight guard: overlapping loadMore calls would apply the same
    // cursor twice and fetch a duplicate page.
    if (!uid || inFlightRef.current || !hasMore || !cursorRef.current) return;
    inFlightRef.current = true;
    const generation = generationRef.current;
    setIsLoadingMore(true);
    setPaginationError(null);

    try {
      const page = await getDueStudyItemsPage(
        uid,
        Date.now(),
        DEFAULT_QUEUE_PAGE_SIZE,
        cursorRef.current,
      );
      const resolved = await resolveQueueEntries(page.items);
      if (generationRef.current !== generation || activeUidRef.current !== uid) return;
      // Dedupe by questionId: a page boundary can legitimately overlap once
      // an item's nextReviewAt has been rewritten by a review.
      setEntries((prev) => mergeResolvedPages(prev, resolved));
      cursorRef.current = page.cursor;
      setHasMore(page.hasMore);
    } catch (error) {
      if (generationRef.current !== generation) return;
      // A failed page must NEVER clear what's already loaded.
      setPaginationError(mapStudyErrorToMessage(error));
    } finally {
      inFlightRef.current = false;
      if (generationRef.current === generation) setIsLoadingMore(false);
    }
  }, [uid, hasMore]);

  // Moves to the next card, pulling another page when the tail is reached,
  // and ending the session when nothing is left.
  const advance = useCallback(
    (nextIndex: number) => {
      if (nextIndex >= entries.length) {
        if (hasMore && cursorRef.current) {
          loadMore().then(() => setIndex(nextIndex));
          return;
        }
        setIsComplete(true);
        return;
      }
      setIndex(nextIndex);
    },
    [entries.length, hasMore, loadMore],
  );

  const submitOutcome = useCallback(
    async (questionId: string, outcome: StudyOutcome) => {
      if (submitLockRef.current) return;
      submitLockRef.current = true;
      setIsSubmitting(true);
      setPendingOutcome(outcome);
      setActionError(null);
      const operation = resolveGestureOperation(operationRef.current, questionId, outcome);
      operationRef.current = operation;

      try {
        await recordStudyOutcome(questionId, outcome, operation.operationId);
        operationRef.current = null;
        setTotals((prev) => ({
          reviewed: prev.reviewed + 1,
          solved: prev.solved + (outcome === "solved" ? 1 : 0),
          struggled: prev.struggled + (outcome === "struggled" ? 1 : 0),
          again: prev.again + (outcome === "again" ? 1 : 0),
        }));
        advance(index + 1);
      } catch (error) {
        setActionError(mapStudyErrorToMessage(error));
      } finally {
        submitLockRef.current = false;
        setIsSubmitting(false);
        setPendingOutcome(null);
      }
    },
    [index, advance],
  );

  // Drops an unavailable (deleted / access-lost) item from the plan, then
  // moves on — this is what stops such an item reappearing forever.
  const removeCurrent = useCallback(
    async (questionId: string) => {
      if (submitLockRef.current) return;
      submitLockRef.current = true;
      setIsSubmitting(true);
      setActionError(null);
      try {
        await removeStudyItemRemote(questionId);
        setEntries((prev) => {
          const items = removeStudyItemById(
            prev.map((e) => e.item),
            questionId,
          );
          return prev.filter((e) => items.some((i) => i.questionId === e.item.questionId));
        });
        // Index deliberately unchanged: removing the current card shifts the
        // next one into this slot.
        advance(index);
      } catch (error) {
        setActionError(mapStudyErrorToMessage(error));
      } finally {
        submitLockRef.current = false;
        setIsSubmitting(false);
      }
    },
    [index, advance],
  );

  const skip = useCallback(() => advance(index + 1), [advance, index]);

  const current = entries[index] ?? null;

  return {
    current,
    index,
    total: entries.length,
    totals,
    isLoading,
    isLoadingMore,
    loadError,
    paginationError,
    actionError,
    pendingOutcome,
    isSubmitting,
    isComplete,
    hasMore,
    submitOutcome,
    removeCurrent,
    skip,
    retry: loadFirstPage,
    retryPagination: loadMore,
  };
}
