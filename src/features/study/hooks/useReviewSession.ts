import { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";
import { useCallback, useEffect, useRef, useState } from "react";

import { StudyOutcome } from "../domain/studyTypes";
import { GestureOperation, resolveGestureOperation } from "../services/gestureOperationId";
import { mapStudyErrorToMessage } from "../services/studyErrorMapper";
import { REVIEW_ADVANCE_DELAY_MS } from "../services/studyPresentation";
import {
  DEFAULT_QUEUE_PAGE_SIZE,
  getDueStudyItemsPage,
  recordStudyOutcome,
  removeStudyItem as removeStudyItemRemote,
  resolveQueueEntries,
  ResolvedQueueEntry,
} from "../services/studyService";
import { interleaveReviewEntries } from "../services/reviewSessionComposition";
import { mergeResolvedPages, removeStudyItemById } from "../services/studyQueueMerge";
import { shouldApplyStaleResponse } from "../services/staleResponseGuard";

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
  // Phase 18 — set the instant the mutation succeeds, cleared once the
  // success flourish's delay elapses and the card actually advances. The
  // card stays showing (with pendingOutcome already cleared, so its
  // buttons are interactive again — a fast student is never blocked)
  // while this is non-null; ReviewSessionScreen renders the flourish off
  // of it. Distinct from `pendingOutcome` (in-flight) on purpose: this is
  // "done, about to move on", not "waiting on the network".
  const [justSucceededOutcome, setJustSucceededOutcome] = useState<StudyOutcome | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isComplete, setIsComplete] = useState(false);

  const cursorRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  // Guards the delayed advance() the same way generationRef guards page
  // loads: if the session restarts (retry) or the component unmounts while
  // the success flourish is still showing, the stale timeout must not fire
  // advance() against a session that's already moved on.
  const advanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    if (advanceTimeoutRef.current) {
      clearTimeout(advanceTimeoutRef.current);
      advanceTimeoutRef.current = null;
    }
    setJustSucceededOutcome(null);
    setIsLoading(true);
    setLoadError(null);
    setIsComplete(false);
    setIndex(0);
    setTotals(EMPTY_TOTALS);

    try {
      const page = await getDueStudyItemsPage(uid, Date.now(), DEFAULT_QUEUE_PAGE_SIZE, null);
      const resolved = await resolveQueueEntries(page.items);
      if (!shouldApplyStaleResponse(generation, generationRef.current) || activeUidRef.current !== uid) return;
      setEntries(resolved);
      cursorRef.current = page.cursor;
      setHasMore(page.hasMore);
    } catch (error) {
      if (!shouldApplyStaleResponse(generation, generationRef.current)) return;
      setLoadError(mapStudyErrorToMessage(error));
    } finally {
      // Safe to gate here (unlike loadMore below): loadFirstPage has no
      // in-flight guard blocking a retry, so a superseded call is always
      // followed by a newer one whose own finally settles isLoading — never
      // stuck true.
      if (shouldApplyStaleResponse(generation, generationRef.current)) setIsLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  // Belt-and-suspenders alongside the retry-time clear above: if the
  // screen unmounts (student navigates away) while the flourish's timeout
  // is still pending, it must never fire against unmounted state.
  useEffect(() => {
    return () => {
      if (advanceTimeoutRef.current) clearTimeout(advanceTimeoutRef.current);
    };
  }, []);

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
      if (!shouldApplyStaleResponse(generation, generationRef.current) || activeUidRef.current !== uid) return;
      // Phase 63 — the INCOMING page is balanced before it is appended, so a
      // page that arrives as five Algebra questions in a row does not read as
      // five Algebra questions in a row.
      //
      // Interleaving the incoming page rather than the merged list is the
      // whole safety argument: entries the student has already seen (or is
      // sitting on right now) are never touched, so nothing can reshuffle
      // underneath them mid-session. It also changes only order — membership,
      // due-ness and the cursor are untouched.
      const balanced = interleaveReviewEntries(resolved);
      // Dedupe by questionId: a page boundary can legitimately overlap once
      // an item's nextReviewAt has been rewritten by a review.
      setEntries((prev) => mergeResolvedPages(prev, balanced));
      cursorRef.current = page.cursor;
      setHasMore(page.hasMore);
    } catch (error) {
      if (!shouldApplyStaleResponse(generation, generationRef.current)) return;
      // A failed page must NEVER clear what's already loaded.
      setPaginationError(mapStudyErrorToMessage(error));
    } finally {
      inFlightRef.current = false;
      // Unconditional, unlike the data-application checks above: this
      // function is guarded by inFlightRef (a synchronous "already running"
      // lock), so unlike loadFirstPage, a retry/loadFirstPage racing this
      // call while it's in flight bumps generationRef WITHOUT that being
      // followed by a guaranteed second loadMore() call to clean up after
      // it. Gating this reset the same way the data-application checks are
      // gated left isLoadingMore stuck true forever whenever that race hit
      // — the inFlightRef.current guard at the top of this function then
      // stayed permanently irrelevant (already false), but isLoadingMore
      // itself never went back to false, leaving the pagination footer
      // spinning forever and onEndReached silently doing nothing (it isn't
      // gated on isLoadingMore, but the UI's spinner never clears). This is
      // the exact bug class useSocialFeed.loadMore had — see its own fix's
      // doc comment.
      setIsLoadingMore(false);
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
        // The mutation and the Study Engine scheduling it triggers are
        // already complete at this point — recordStudyOutcome has
        // resolved. Everything below is purely presentational: hold this
        // SAME card in its "just answered" state for a short, fixed delay
        // (the success flourish) before moving on. No scheduling/algorithm
        // logic lives here.
        setJustSucceededOutcome(outcome);
        setPendingOutcome(null);
        setIsSubmitting(false);
        // submitLockRef stays held through the flourish (released below,
        // not in `finally`) — the card on screen hasn't changed yet, so a
        // second tap during this window must still be ignored rather than
        // firing a second mutation for the same question.
        advanceTimeoutRef.current = setTimeout(() => {
          advanceTimeoutRef.current = null;
          setJustSucceededOutcome(null);
          submitLockRef.current = false;
          advance(index + 1);
        }, REVIEW_ADVANCE_DELAY_MS);
        return;
      } catch (error) {
        setActionError(mapStudyErrorToMessage(error));
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
    // Phase 28 — exposed so StudySessionScreen can render every currently
    // loaded due card in a real swipeable FlatList (matching the main
    // Feed's vertical-swipe feel) instead of only ever showing `current`
    // one at a time. Nothing about how `entries` itself is fetched,
    // paginated, or deduped changes — this is the exact same array
    // ReviewSessionScreen's replacement now just gets to read directly.
    entries,
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
    justSucceededOutcome,
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
