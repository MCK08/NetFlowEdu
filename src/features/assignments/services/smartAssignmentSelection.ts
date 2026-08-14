import { buildRecencySignal } from "@features/study/services/recencySignal";
import { Question } from "@/types/question";

// The Teacher Action Center's "smart" assignment builder. NOT a second
// learning engine: every signal here is either read directly off Question
// metadata (subject/topic/gradeLevel/choices — real fields, nothing
// invented) or off the SAME buildRecencySignal Phase 25's engines already
// use, applied to real per-question history the targeted students already
// have (their own StudyItem docs — see buildTargetedQuestionSignals).
// Nothing here computes mastery, writes a StudyItem, or touches
// nextReviewAt/recordStudyOutcome — this only decides which of an
// ALREADY-FETCHED, ALREADY-CLASS-SCOPED question pool to put into one
// assignment's snapshot.

// An assignment is explicitly about ONE subject/topic/grade (the teacher
// chose it) — subject is a hard filter below, never a scored criterion:
// unlike the daily practice plan's goal_fill tier, which deliberately
// widens to "anything active" once better matches run out, an assignment
// must never silently substitute unrelated content for what the teacher
// asked for.
export interface QuestionSelectionCriteria {
  subject: string;
  topic: string;
  gradeLevel: string;
}

export type AssignmentSelectionStrategy = "focus" | "balanced" | "reinforce";

// Real, per-question history aggregated across the assignment's TARGETED
// students only (never the whole class) — built from each targeted
// student's own users/{uid}/studyItems, the exact same class-sourced read
// useClassPerformance/useAssignmentDetail already use (one read per
// student, zero per-question reads). A question with no entry in this map
// has never been attempted by any targeted student at all.
export interface TargetedQuestionSignal {
  everAttemptedCount: number;
  struggledCount: number;
  // The most recent lastReviewedAt across every targeted student who has
  // ever attempted this question — null only when everAttemptedCount is 0.
  mostRecentReviewedAt: number | null;
}

export type SelectionReasonCode = "struggled" | "new_practice" | "stale_topic" | "balanced_mix" | "topic_match";

const REASON_LABELS: Record<SelectionReasonCode, string> = {
  struggled: "Zorlandığın konu",
  new_practice: "Yeni pratik",
  stale_topic: "Bu konuda uzun süredir soru çözülmedi",
  balanced_mix: "Dengeli tekrar için seçildi",
  topic_match: "Konu kapsamını tamamlıyor",
};

export interface SelectedAssignmentQuestion {
  questionId: string;
  reasonCode: SelectionReasonCode;
  reasonLabel: string;
  isMultipleChoice: boolean;
}

export interface SmartSelectionResult {
  selected: SelectedAssignmentQuestion[];
  // Eligible (topic/subject/grade-matching) questions that were NOT picked
  // — either because targetCount was reached, or because the pool simply
  // didn't have enough. Real ids, never a fabricated count.
  omittedQuestionIds: string[];
  requestedCount: number;
}

// Higher = better base match. -1 = ineligible (wrong subject) — identical
// rule to assignmentQuestionSelection.ts's own matchScore; kept as its own
// copy here (not imported) because the two files answer genuinely
// different questions (plain selection vs. strategy-aware selection) and
// this repo's own convention (see dailyPracticePlan.ts vs.
// assignmentQuestionSelection.ts) is small, independently-testable pure
// modules over a shared abstraction neither strictly needs.
function baseMatchScore(question: Question, criteria: QuestionSelectionCriteria): number {
  if (question.subject !== criteria.subject) return -1;
  let score = 0;
  if (question.topic === criteria.topic) score += 2;
  if (question.gradeLevel === criteria.gradeLevel) score += 1;
  return score;
}

function isMultipleChoice(question: Question): boolean {
  return question.choices !== null && question.correctChoice !== null;
}

function dedupeById(pool: readonly Question[]): Question[] {
  const seen = new Map<string, Question>();
  for (const question of pool) {
    if (!seen.has(question.id)) seen.set(question.id, question);
  }
  return [...seen.values()];
}

function stableTiebreak(a: Question, b: Question): number {
  if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
  return a.id.localeCompare(b.id);
}

// How many questions in `pool` are actually eligible (subject/topic/grade)
// for `criteria` — used by the caller (useCreateAssignment) to decide
// whether another bounded page of the class's question pool is worth
// fetching before giving up, without duplicating the eligibility rule.
export function countEligibleQuestions(pool: readonly Question[], criteria: QuestionSelectionCriteria): number {
  return dedupeById(pool).filter((question) => baseMatchScore(question, criteria) >= 0).length;
}

function eligibleSorted(pool: readonly Question[], criteria: QuestionSelectionCriteria) {
  return dedupeById(pool)
    .map((question) => ({ question, score: baseMatchScore(question, criteria) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return stableTiebreak(a.question, b.question);
    });
}

function pickWithReason(
  entries: { question: Question; score: number }[],
  count: number,
  reasonCode: SelectionReasonCode,
): SelectedAssignmentQuestion[] {
  return entries.slice(0, Math.max(0, count)).map(({ question }) => ({
    questionId: question.id,
    reasonCode,
    reasonLabel: REASON_LABELS[reasonCode],
    isMultipleChoice: isMultipleChoice(question),
  }));
}

// FOCUS — exactly assignmentQuestionSelection.ts's existing behavior
// (topic/grade tiebreak on top of the subject hard-filter), zero targeted-
// student signal. Every pick reasons "topic_match".
function selectFocus(
  pool: readonly Question[],
  criteria: QuestionSelectionCriteria,
  targetCount: number,
): SmartSelectionResult {
  const eligible = eligibleSorted(pool, criteria);
  const selected = pickWithReason(eligible, targetCount, "topic_match");
  const selectedIds = new Set(selected.map((s) => s.questionId));
  return {
    selected,
    omittedQuestionIds: eligible.map((e) => e.question.id).filter((id) => !selectedIds.has(id)),
    requestedCount: targetCount,
  };
}

// BALANCED — same eligible pool, but interleaves multiple-choice and
// non-multiple-choice questions where both are available, so a 10-question
// assignment isn't accidentally all-MC or all-image-only. Uses only
// Question's own real `choices` field — no invented difficulty axis. Zero
// targeted-student signal (same read cost as FOCUS).
function selectBalanced(
  pool: readonly Question[],
  criteria: QuestionSelectionCriteria,
  targetCount: number,
): SmartSelectionResult {
  const eligible = eligibleSorted(pool, criteria);
  const mc = eligible.filter((e) => isMultipleChoice(e.question));
  const nonMc = eligible.filter((e) => !isMultipleChoice(e.question));

  const interleaved: typeof eligible = [];
  let mcIndex = 0;
  let nonMcIndex = 0;
  // Alternate starting with whichever group is larger, so a pool that's
  // mostly one type still fills up to targetCount instead of stopping
  // early once the smaller group is exhausted.
  let takeMcNext = mc.length >= nonMc.length;
  while (interleaved.length < eligible.length) {
    if (takeMcNext && mcIndex < mc.length) {
      interleaved.push(mc[mcIndex] as (typeof eligible)[number]);
      mcIndex += 1;
    } else if (!takeMcNext && nonMcIndex < nonMc.length) {
      interleaved.push(nonMc[nonMcIndex] as (typeof eligible)[number]);
      nonMcIndex += 1;
    } else if (mcIndex < mc.length) {
      interleaved.push(mc[mcIndex] as (typeof eligible)[number]);
      mcIndex += 1;
    } else if (nonMcIndex < nonMc.length) {
      interleaved.push(nonMc[nonMcIndex] as (typeof eligible)[number]);
      nonMcIndex += 1;
    }
    takeMcNext = !takeMcNext;
  }

  const selected = pickWithReason(interleaved, targetCount, "balanced_mix");
  const selectedIds = new Set(selected.map((s) => s.questionId));
  return {
    selected,
    omittedQuestionIds: interleaved.map((e) => e.question.id).filter((id) => !selectedIds.has(id)),
    requestedCount: targetCount,
  };
}

// REINFORCE — the one strategy that spends the extra read (targeted
// students' own class-sourced study items, see
// buildTargetedQuestionSignals) to prioritize, in order:
//   1. struggled  — at least one targeted student's own history on this
//      EXACT question has a struggle recorded
//   2. new_practice — no targeted student has ever attempted this exact
//      question at all
//   3. stale_topic — every targeted student who attempted it did so long
//      enough ago that buildRecencySignal (Phase 25's own engine, same
//      thresholds) calls it "stale"
//   4. balanced_mix — everything else (recently practiced, no struggle —
//      deliberately last, per §9's "recently solved without struggle goes
//      to the back")
// Within each tier, the same base topic/grade/newest/id tiebreak as
// FOCUS/BALANCED — this never reorders WHICH tier a question lands in,
// only the order within one, exactly the pattern dailyPracticePlan.ts's
// own tier system already established.
function selectReinforce(
  pool: readonly Question[],
  criteria: QuestionSelectionCriteria,
  targetCount: number,
  signals: ReadonlyMap<string, TargetedQuestionSignal>,
  now: number,
): SmartSelectionResult {
  const eligible = eligibleSorted(pool, criteria);

  const struggled: typeof eligible = [];
  const newPractice: typeof eligible = [];
  const stale: typeof eligible = [];
  const rest: typeof eligible = [];

  for (const entry of eligible) {
    const signal = signals.get(entry.question.id);
    if (signal && signal.struggledCount > 0) {
      struggled.push(entry);
    } else if (!signal || signal.everAttemptedCount === 0) {
      newPractice.push(entry);
    } else if (
      signal.mostRecentReviewedAt !== null &&
      buildRecencySignal(signal.mostRecentReviewedAt, now) === "stale"
    ) {
      stale.push(entry);
    } else {
      rest.push(entry);
    }
  }

  const ordered = [...struggled, ...newPractice, ...stale, ...rest];
  const reasonByQuestionId = new Map<string, SelectionReasonCode>();
  for (const entry of struggled) reasonByQuestionId.set(entry.question.id, "struggled");
  for (const entry of newPractice) reasonByQuestionId.set(entry.question.id, "new_practice");
  for (const entry of stale) reasonByQuestionId.set(entry.question.id, "stale_topic");
  for (const entry of rest) reasonByQuestionId.set(entry.question.id, "balanced_mix");

  const safeTargetCount = Number.isFinite(targetCount) && targetCount > 0 ? Math.floor(targetCount) : 0;
  const selected: SelectedAssignmentQuestion[] = ordered.slice(0, safeTargetCount).map((entry) => {
    const reasonCode = reasonByQuestionId.get(entry.question.id) ?? "balanced_mix";
    return {
      questionId: entry.question.id,
      reasonCode,
      reasonLabel: REASON_LABELS[reasonCode],
      isMultipleChoice: isMultipleChoice(entry.question),
    };
  });
  const selectedIds = new Set(selected.map((s) => s.questionId));

  return {
    selected,
    omittedQuestionIds: ordered.map((e) => e.question.id).filter((id) => !selectedIds.has(id)),
    requestedCount: targetCount,
  };
}

export interface SelectSmartAssignmentQuestionsParams {
  pool: readonly Question[];
  criteria: QuestionSelectionCriteria;
  targetCount: number;
  strategy: AssignmentSelectionStrategy;
  // Ignored by "focus"/"balanced" — only "reinforce" reads this, which is
  // exactly why those two modes cost zero extra reads (see
  // useCreateAssignment.ts: signals are only fetched when strategy ===
  // "reinforce").
  targetedQuestionSignals: ReadonlyMap<string, TargetedQuestionSignal>;
  now: number;
}

// The single entry point. Deterministic — the same input always produces
// byte-identical output. No mutation of `pool`.
export function selectSmartAssignmentQuestions(
  params: SelectSmartAssignmentQuestionsParams,
): SmartSelectionResult {
  const safeNow = Number.isFinite(params.now) ? params.now : Date.now();
  switch (params.strategy) {
    case "focus":
      return selectFocus(params.pool, params.criteria, params.targetCount);
    case "balanced":
      return selectBalanced(params.pool, params.criteria, params.targetCount);
    case "reinforce":
      return selectReinforce(params.pool, params.criteria, params.targetCount, params.targetedQuestionSignals, safeNow);
  }
}

// Built from each TARGETED student's own class-sourced StudyItem[] (one
// read per student — see useCreateAssignment.ts) — never a per-question
// read. A question absent from the returned map was never attempted by
// any targeted student at all.
export function buildTargetedQuestionSignals(
  studyItemsByStudent: readonly { questionId: string; lastOutcome: string; lastReviewedAt: number }[][],
): Map<string, TargetedQuestionSignal> {
  const signals = new Map<string, TargetedQuestionSignal>();

  for (const studentItems of studyItemsByStudent) {
    for (const item of studentItems) {
      const existing = signals.get(item.questionId) ?? {
        everAttemptedCount: 0,
        struggledCount: 0,
        mostRecentReviewedAt: null,
      };
      existing.everAttemptedCount += 1;
      if (item.lastOutcome === "struggled" || item.lastOutcome === "again") existing.struggledCount += 1;
      if (item.lastReviewedAt > 0 && (existing.mostRecentReviewedAt ?? 0) < item.lastReviewedAt) {
        existing.mostRecentReviewedAt = item.lastReviewedAt;
      }
      signals.set(item.questionId, existing);
    }
  }

  return signals;
}
