import { useCallback, useEffect, useRef, useState } from "react";

import { shouldApplyStaleResponse } from "@features/study/services/staleResponseGuard";
import { useSubmitLock } from "@hooks/useSubmitLock";

import { mapAnswerReviewError } from "../services/answerReviewCopy";

// Phase 97/98 — the state behind a class teacher's review queue, for any
// target type. The answer queue (Phase 97) and the comment queue (Phase 98)
// differ only in what a row and a detail carry and which callables they hit;
// the pending-work behaviour is identical, so it lives once:
//
// One bounded page on open; "load more" on demand; no listener, no polling.
// Opening an item fetches its detail; a decision removes the item locally and
// clears the detail. Nothing here writes to Firestore — every mutation is the
// review callable.

export type QueueStatus = "loading" | "ready" | "error";
export type ReviewDecision = "approve" | "reject";

export interface ReviewQueuePage<TItem> {
  items: TItem[];
  nextCursor: string | null;
  pageSize: number;
}

export interface ReviewResult {
  submissionId: string;
  status: "approved" | "rejected";
  publishedEntityId: string | null;
  alreadyDecided: boolean;
}

export interface ReviewQueueServices<TItem extends { submissionId: string }, TDetail> {
  list: (classId: string, cursor: string | null) => Promise<ReviewQueuePage<TItem>>;
  detail: (submissionId: string) => Promise<TDetail>;
  decide: (submissionId: string, decision: ReviewDecision) => Promise<ReviewResult>;
  /** The sentence shown after a decision — answer and comment wording differ. */
  outcomeCopy: (status: ReviewResult["status"], alreadyDecided: boolean) => string;
}

export function useReviewQueue<TItem extends { submissionId: string }, TDetail>(
  classId: string | undefined,
  services: ReviewQueueServices<TItem, TDetail>,
) {
  const [items, setItems] = useState<TItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<QueueStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [decisionNotice, setDecisionNotice] = useState<string | null>(null);
  const [pendingDecision, setPendingDecision] = useState<ReviewDecision | null>(null);

  const requestIdRef = useRef(0);
  const detailRequestRef = useRef(0);
  const submitLock = useSubmitLock();
  const { list, detail: loadDetail, decide: submitDecision, outcomeCopy } = services;

  const load = useCallback(async () => {
    if (!classId) return;
    const requestId = ++requestIdRef.current;
    setStatus("loading");
    setError(null);
    try {
      const page = await list(classId, null);
      if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;
      setItems(page.items);
      setNextCursor(page.nextCursor);
      setStatus("ready");
    } catch (err) {
      if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;
      setError(mapAnswerReviewError(err));
      setStatus("error");
    }
  }, [classId, list]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!classId || !nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const page = await list(classId, nextCursor);
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
  }, [classId, list, nextCursor, isLoadingMore]);

  const select = useCallback(
    async (submissionId: string | null) => {
      setSelectedId(submissionId);
      setDetail(null);
      setDetailError(null);
      setDecisionError(null);
      setDecisionNotice(null);
      if (!submissionId) return;
      const requestId = ++detailRequestRef.current;
      setIsDetailLoading(true);
      try {
        const loaded = await loadDetail(submissionId);
        if (!shouldApplyStaleResponse(requestId, detailRequestRef.current)) return;
        setDetail(loaded);
      } catch (err) {
        if (!shouldApplyStaleResponse(requestId, detailRequestRef.current)) return;
        setDetailError(mapAnswerReviewError(err));
      } finally {
        if (shouldApplyStaleResponse(requestId, detailRequestRef.current)) setIsDetailLoading(false);
      }
    },
    [loadDetail],
  );

  /** Explicit decision. One callable, locked against a double tap. */
  const decide = useCallback(
    async (decision: ReviewDecision) => {
      if (!selectedId || !submitLock.acquire()) return;
      setPendingDecision(decision);
      setDecisionError(null);
      setDecisionNotice(null);
      try {
        const result = await submitDecision(selectedId, decision);
        setDecisionNotice(outcomeCopy(result.status, result.alreadyDecided));
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
    [selectedId, submitDecision, outcomeCopy, submitLock],
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
