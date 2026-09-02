import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { StudyOutcome } from "../domain/studyTypes";
import { StudySummary } from "../services/studyService";
import { resolveQuestionMetadata } from "../services/studyMetadataCache";
import { toFrozenSessionQuestions } from "../services/studySessionQuestions";
import { shouldApplyStaleResponse } from "../services/staleResponseGuard";
import { Question } from "@/types/question";

import { useLearningTrail } from "@features/learningStory/hooks/useLearningTrail";

import {
  appendSessionReceipt,
  SessionOutcomeReceipt,
} from "../services/sessionReflection";
import {
  ActiveStudySessionMode,
  buildActiveStudySession,
  normalizePlannedQuestionIds,
  resolveCompletedSession,
  resolveSessionStart,
} from "../services/activeStudySession";
import {
  clearStudySessionSlot,
  loadActiveStudySessionRaw,
  saveStudySessionSlot,
} from "../services/activeStudySessionStorage";
import { resolveAdaptiveSessionCompletion } from "../services/adaptiveSessionCompletion";

import { useLearningInsights } from "./useLearningInsights";

const ACTIVE_SESSION_MODE: ActiveStudySessionMode = "adaptive";

// Phase 28 — "Çalışmaya Devam Et": the FREE/adaptive round that follows a
// completed mandatory review. Reuses useLearningInsights ENTIRELY (the
// exact same hook StudyScreen's "Bugünkü Plan" already renders from) for
// the plan itself — this hook adds nothing to ranking/priority, it only
// resolves that plan's questionIds into real Question objects via the
// SAME shared studyMetadataCache every other study/feed surface already
// warms, so this typically costs zero additional Firestore reads (the
// question was very likely already fetched by useLearningInsights's own
// join a moment earlier).
//
// Phase 68 — and it now owns the session's LIFECYCLE as well as its content.
//
// WHY THE PLAN IS FROZEN
//
// The live plan is not stable while a student is inside it. Its length is
// `min(dailyGoal - reviewedToday, MAX_PLAN_ITEMS)`, and `reviewedToday`
// arrives on a live Firestore listener, so every confirmed outcome shortens
// it from the tail. Rendering the live plan meant the student's remaining
// cards disappeared underneath them as they worked, and it meant "the list is
// empty" — the old completion test — actually signalled "daily goal reached".
//
// So the id list is frozen at the moment the session begins, and everything
// after that resolves against the frozen list. New adaptive intelligence
// (Phase 45 ranking, Phase 61 chronology, Phase 65 pacing) still applies in
// full; it applies to the NEXT session, which is the same stability
// philosophy Phase 61 already stated for chronology and Phase 65 for pacing.
//
// Nothing here touches ranking, scheduling or classification. Only lifecycle.
export function useAdaptiveStudySession(uid: string | undefined, summary: StudySummary) {
  // Phase 61 — the SAME bounded studyEvents query Phase 59 already defined
  // (useLearningTrail), reused rather than duplicated. It resolves once per
  // mount and is not refetched while a session runs, which is what keeps the
  // question order stable: a new outcome influences the NEXT composition, not
  // the session the student is currently in.
  const { events: chronologyEvents } = useLearningTrail(uid);
  const {
    plan,
    isLoading: isLoadingInsights,
    error,
    refresh: refreshInsights,
  } = useLearningInsights(uid, summary, chronologyEvents);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isResolving, setIsResolving] = useState(true);
  const requestIdRef = useRef(0);

  // The frozen completion contract. null until the session has been resolved
  // — either adopted from storage or taken from the first live plan.
  const [plannedQuestionIds, setPlannedQuestionIds] = useState<string[] | null>(null);
  const [receipts, setReceipts] = useState<SessionOutcomeReceipt[]>([]);
  const receiptsRef = useRef<SessionOutcomeReceipt[]>([]);
  receiptsRef.current = receipts;
  const sessionRef = useRef<{ id: string; startedAt: number } | null>(null);
  // False until storage has been consulted. Nothing may read the receipt list,
  // and nothing may freeze a plan, before this is true: acting earlier would
  // start a second session on top of one that is still resuming.
  const [isSessionHydrated, setIsSessionHydrated] = useState(false);
  // A session that already finished, restored so its closure summary survives
  // a refresh of the completion screen.
  const [isRestoredCompletion, setIsRestoredCompletion] = useState(false);
  const activeUidRef = useRef(uid);
  activeUidRef.current = uid;

  // Phase 68 — adopt the active adaptive session, restore a just-completed
  // one, or begin a new one. Runs once per user.
  //
  // Order matters: a COMPLETED snapshot is checked first, because a completed
  // session is not resumable and must not be reopened as active. Everything
  // is matched on user AND mode, so a review session's envelope can never
  // hydrate here and this one can never hydrate there.
  useEffect(() => {
    if (!uid) {
      setIsSessionHydrated(false);
      return;
    }
    let cancelled = false;
    setIsSessionHydrated(false);
    setIsRestoredCompletion(false);

    (async () => {
      const raw = await loadActiveStudySessionRaw();
      if (cancelled || activeUidRef.current !== uid) return;
      const now = Date.now();

      const completed = resolveCompletedSession({ raw, userId: uid, mode: ACTIVE_SESSION_MODE, now });
      if (completed) {
        sessionRef.current = { id: completed.sessionInstanceId, startedAt: completed.startedAt };
        setPlannedQuestionIds(completed.plannedQuestionIds);
        setReceipts((prev) => completed.receipts.reduce(appendSessionReceipt, prev));
        setIsRestoredCompletion(true);
        setIsSessionHydrated(true);
        return;
      }

      const start = resolveSessionStart({ raw, userId: uid, mode: ACTIVE_SESSION_MODE, now });
      sessionRef.current = { id: start.sessionInstanceId, startedAt: start.startedAt };
      // Merged, never assigned — the same reasoning as useReviewSession's own
      // hydration: if an outcome were confirmed while this read was in flight,
      // overwriting would drop it, and operationId settles any overlap.
      setReceipts((prev) => start.receipts.reduce(appendSessionReceipt, prev));
      // A resumed session keeps the plan it committed to. A new one has none
      // yet and freezes the live plan below.
      setPlannedQuestionIds(start.plannedQuestionIds.length > 0 ? start.plannedQuestionIds : null);
      setIsSessionHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [uid]);

  // Freeze the plan, once, for a session that does not have one yet.
  //
  // Deliberately not in the resolve effect below: freezing is a lifecycle
  // decision made exactly once, and re-running it whenever the live plan
  // changed is precisely the mid-session mutation this phase removes.
  useEffect(() => {
    if (!isSessionHydrated || isLoadingInsights) return;
    if (plannedQuestionIds !== null) return;
    const frozen = normalizePlannedQuestionIds(plan.planItems.map((item) => item.questionId));
    // An empty plan is frozen as empty rather than left null: that is a real
    // answer ("there is nothing to practise"), and leaving it null would make
    // the effect re-run against every subsequent plan and eventually freeze a
    // list the session never started with.
    setPlannedQuestionIds(frozen);
  }, [isSessionHydrated, isLoadingInsights, plannedQuestionIds, plan.planItems]);

  // Resolve the FROZEN ids into questions. Runs when the frozen list changes,
  // which after the initial freeze is never — so nothing reshuffles or
  // disappears underneath the student.
  useEffect(() => {
    if (plannedQuestionIds === null) return;
    let cancelled = false;
    const requestId = ++requestIdRef.current;

    async function resolve() {
      setIsResolving(true);
      // The same shared metadata cache the plan itself resolved through a
      // moment ago, so this is normally a cache hit and costs no read. After a
      // refresh it is one bounded lookup for ids the session already owns —
      // never a new query, never per-question.
      const metadata = await resolveQuestionMetadata(plannedQuestionIds as string[]);
      if (cancelled || !shouldApplyStaleResponse(requestId, requestIdRef.current)) return;
      setQuestions(toFrozenSessionQuestions(plannedQuestionIds as string[], metadata));
      setIsResolving(false);
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [plannedQuestionIds]);

  const completion = useMemo(
    () =>
      resolveAdaptiveSessionCompletion({
        plannedQuestionIds: plannedQuestionIds ?? [],
        resolvableQuestionIds: questions.map((question) => question.id),
        receipts,
      }),
    [plannedQuestionIds, questions, receipts],
  );

  // Completion is a fact about confirmed outcomes, so it can only be read once
  // the receipts are known. Before hydration the answer is "not yet", never a
  // provisional "no" that could flash a wrong state.
  const isComplete = isSessionHydrated && (isRestoredCompletion || completion.isComplete);

  // Persist the completion the moment it is reached, so refreshing the
  // completion screen restores the same summary instead of losing it.
  //
  // Stamped, not cleared: clearing here is what made Phase 67's completion
  // screen lose its summary on refresh, and rebuilding it afterwards would
  // have meant inventing session membership. The stamp also makes the record
  // un-resumable, so a finished session can never reopen as an active one.
  const persistedCompletionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isComplete || isRestoredCompletion) return;
    const session = sessionRef.current;
    const userId = activeUidRef.current;
    if (!session || !userId) return;
    if (persistedCompletionRef.current === session.id) return;
    persistedCompletionRef.current = session.id;
    saveStudySessionSlot(
      buildActiveStudySession({
        sessionInstanceId: session.id,
        userId,
        mode: ACTIVE_SESSION_MODE,
        startedAt: session.startedAt,
        receipts: receiptsRef.current,
        plannedQuestionIds: plannedQuestionIds ?? [],
        completedAt: Date.now(),
      }),
    );
  }, [isComplete, isRestoredCompletion, plannedQuestionIds]);

  /** Records one CONFIRMED outcome against this session.
   *
   *  Called only after recordStudyOutcome resolved — the operationId exists
   *  because the write succeeded, so a failed or pending write can never reach
   *  here and can never advance the completion contract. Keyed on that same
   *  id, so a replayed callback collapses to one receipt exactly as the
   *  server collapses it to one review. */
  const confirmOutcome = useCallback(
    (question: Question, outcome: StudyOutcome, operationId: string) => {
      const next = appendSessionReceipt(receiptsRef.current, {
        operationId,
        questionId: question.id,
        subject: question.subject ?? "",
        topic: question.topic ?? "",
        outcome,
      });
      // Nothing changed — a replay of an outcome already recorded. Returning
      // early keeps the persisted copy identical too, rather than rewriting
      // storage with the same bytes on every duplicate delivery.
      if (next.length === receiptsRef.current.length) return;
      receiptsRef.current = next;
      setReceipts(next);

      const session = sessionRef.current;
      const userId = activeUidRef.current;
      if (!session || !userId || plannedQuestionIds === null) return;
      // Deliberately not awaited: the card advance must not wait on a local
      // write, and a failed local write is not a failed study outcome — the
      // session simply keeps its in-memory receipt.
      saveStudySessionSlot(
        buildActiveStudySession({
          sessionInstanceId: session.id,
          userId,
          mode: ACTIVE_SESSION_MODE,
          startedAt: session.startedAt,
          receipts: next,
          plannedQuestionIds,
        }),
      );
    },
    [plannedQuestionIds],
  );

  /** Called when the student leaves the completion screen.
   *
   *  Drops the completed snapshot so the next visit starts a genuinely new
   *  session rather than reopening the summary of the last one. Separate from
   *  completion itself on purpose: the snapshot has to outlive a refresh, and
   *  only an explicit departure says the student is done reading it. */
  const acknowledgeCompletion = useCallback(() => {
    clearStudySessionSlot(ACTIVE_SESSION_MODE);
  }, []);

  return {
    questions,
    isLoading: isLoadingInsights || isResolving || !isSessionHydrated,
    error,
    refresh: refreshInsights,
    receipts,
    isSessionHydrated,
    completion,
    isComplete,
    confirmOutcome,
    acknowledgeCompletion,
  };
}
