import { useCallback, useEffect, useRef, useState } from "react";

import { shouldApplyStaleResponse } from "@features/study/services/staleResponseGuard";
import { useSubmitLock } from "@hooks/useSubmitLock";

import { mapAnswerReviewError, reviewOutcomeCopy } from "../services/answerReviewCopy";
import {
  AnswerReviewDecision,
  AnswerReviewDetail,
  AnswerReviewQueueItem,
  getAnswerReviewDetail,
  listAnswerReviewQueue,
  reviewAnswerSubmission,
} from "../services/answerReviewService";

// Phase 97 — the state behind the class teacher's review queue.
//
// One bounded page on open; "load more" on demand; no listener, no polling.
// Opening an item fetches its detail (which is where the server mints access
// to the image); a decision removes the item locally and clears the detail.
// Nothing here writes to Firestore — every mutation is the review callable.

export type QueueStatus = "loading" | "ready" | "error";

export function useAnswerReviewQueue(classId: string | undefined) {
  const [items, setItems] = useState<AnswerReviewQueueItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<QueueStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AnswerReviewDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [decisionNotice, setDecisionNotice] = useState<string | null>(null);
  const [pendingDecision, setPendingDecision] = useState<AnswerReviewDecision | null>(null);

  const requestIdRef = useRef(0);
  const detailRequestRef = useRef(0);
  const submitLock = useSubmitLock();

  const load = useCallback(async () => {
    if (!classId) return;
    const requestId = ++requestIdRef.current;
    setStatus("loading");
    setError(null);
    try {
      const page = await listAnswerReviewQueue(classId, null);
      if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;
      setItems(page.items);
      setNextCursor(page.nextCursor);
      setStatus("ready");
    } catch (err) {
      if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;
      setError(mapAnswerReviewError(err));
      setStatus("error");
    }
  }, [classId]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!classId || !nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const page = await listAnswerReviewQueue(classId, nextCursor);
      setItems((current) => {
        const seen = new Set(current.map((item) => item.submissionId));
        return [...current, ...page.items.filter((item) => !seen.has(item.submissionId))];
      });
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(mapAnswerReviewError(err));
    } finally {
      setIsLoadingMore(false);
    }
  }, [classId, nextCursor, isLoadingMore]);

  const select = useCallback(async (submissionId: string | null) => {
    setSelectedId(submissionId);
    setDetail(null);
    setDetailError(null);
    setDecisionError(null);
    setDecisionNotice(null);
    if (!submissionId) return;
    const requestId = ++detailRequestRef.current;
    setIsDetailLoading(true);
    try {
      const loaded = await getAnswerReviewDetail(submissionId);
      if (!shouldApplyStaleResponse(requestId, detailRequestRef.current)) return;
      setDetail(loaded);
    } catch (err) {
      if (!shouldApplyStaleResponse(requestId, detailRequestRef.current)) return;
      setDetailError(mapAnswerReviewError(err));
    } finally {
      if (shouldApplyStaleResponse(requestId, detailRequestRef.current)) setIsDetailLoading(false);
    }
  }, []);

  /** Explicit decision. One callable, locked against a double tap. */
  const decide = useCallback(
    async (decision: AnswerReviewDecision) => {
      if (!selectedId || !submitLock.acquire()) return;
      setPendingDecision(decision);
      setDecisionError(null);
      setDecisionNotice(null);
      try {
        const result = await reviewAnswerSubmission(selectedId, decision);
        setDecisionNotice(reviewOutcomeCopy(result.status, result.alreadyDecided));
        // Decided — whichever way, it is no longer pending work.
        setItems((current) => current.filter((item) => item.submissionId !== selectedId));
        setSelectedId(null);
        setDetail(null);
      } catch (err) {
        const message = mapAnswerReviewError(err);
        const code = (err as { code?: string })?.code ?? "";
        if (code.endsWith("failed-precondition")) {
          // Already decided — by another session, or an earlier tap whose
          // response was lost. Say so at the top (the detail is about to
          // close) and drop the item rather than leave dead work in the list.
          setDecisionNotice(message);
          setItems((current) => current.filter((item) => item.submissionId !== selectedId));
          setSelectedId(null);
          setDetail(null);
        } else {
          setDecisionError(message);
        }
      } finally {
        setPendingDecision(null);
        submitLock.release();
      }
    },
    [selectedId, submitLock],
  );

  return {
    items,
    status,
    error,
    hasMore: nextCursor !== null,
    isLoadingMore,
    loadMore,
    refresh: load,
    selectedId,
    detail,
    detailError,
    isDetailLoading,
    select,
    decide,
    pendingDecision,
    decisionError,
    decisionNotice,
    clearNotice: () => setDecisionNotice(null),
  };
}
