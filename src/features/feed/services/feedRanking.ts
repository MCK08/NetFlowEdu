import { MasteryBand } from "@features/study/services/topicMastery";
import { RecencySignal, recencyPriorityIndex } from "@features/study/services/recencySignal";
import { Question } from "@/types/question";

// Phase 26 — personalizes the main Akış feed by REORDERING the questions
// useSocialFeed already fetched, never by fetching anything new or
// re-deriving mastery/recency/due-ness itself. Every signal here comes
// straight from Phase 22/25's existing, already-tested engines
// (topicMastery.ts, recencySignal.ts, learningInsights.ts's TopicInsight) —
// this file only decides ORDER, exactly the same role feedFilters.ts plays
// for filtering: a pure reordering layer in front of reconcileFeedItems,
// which already knows how to reconcile an arbitrary reorder of `questions`
// without corrupting reshow pairs or producing duplicate keys (Phase 20).

export interface QuestionSignal {
  // Whether the caller's OWN studyItem for this question is currently due
  // (nextReviewAt <= now) — straight from StudyItem, not recomputed here.
  isDue: boolean;
  // The caller's last recorded outcome for this question, or null if
  // they've never studied it at all (a genuinely new/discovery item).
  lastOutcome: "again" | "struggled" | "solved" | null;
  // The question's TOPIC's mastery band (topicMastery.ts) — null when the
  // question has no subject/topic bucket to look up (legacy metadata, or a
  // topic the caller has no study items in at all).
  masteryBand: MasteryBand | null;
  // The question's TOPIC's recency signal (recencySignal.ts) — same
  // null-when-unbucketed rule as masteryBand.
  recency: RecencySignal | null;
}

export interface BuildQuestionFeedRankingParams {
  questions: readonly Question[];
  // Keyed by questionId. A question with no entry is treated exactly like
  // one whose signal has every field at its most "unknown" value (isDue:
  // false, lastOutcome: null, masteryBand: null, recency: null) — i.e. a
  // pure discovery item, never an error.
  signalsByQuestionId: ReadonlyMap<string, QuestionSignal>;
  // Session-local "recently shown" set (see useFeedPersonalizationSignals)
  // — never persisted to Firestore. Membership only ever DEPRIORITIZES a
  // question within its own tier; it never excludes one outright, so a
  // small feed can never be ranked down to nothing.
  recentlyShownIds: ReadonlySet<string>;
}

const NO_SIGNAL: QuestionSignal = {
  isDue: false,
  lastOutcome: null,
  masteryBand: null,
  recency: null,
};

// Lower tier number = higher priority = sorts first. Every branch is a
// structural fact about the signal, not a tunable score:
//   0 due            — a real, scheduled obligation
//   1 struggled      — the caller got this specific question wrong recently
//   2 weak topic     — the question's topic is shaky/learning overall
//   3 discovery      — never studied at all (exploration, §7's "yeni
//                      konular da keşfetmeli" — kept ABOVE developed
//                      topics, not buried at the bottom, so exploration
//                      and reinforcement stay balanced rather than the
//                      feed locking onto weak topics exclusively)
//   4 developed      — everything with real, non-weak progress
function tierOf(signal: QuestionSignal): number {
  if (signal.isDue) return 0;
  if (signal.lastOutcome === "struggled") return 1;
  if (signal.masteryBand === "shaky" || signal.masteryBand === "learning") return 2;
  if (signal.masteryBand === null) return 3;
  return 4;
}

// Only meaningful as a WITHIN-tier tiebreaker — recency has no bearing on
// which tier a question lands in, only on which of two same-tier questions
// surfaces first (staler practice first, same "needs attention sooner"
// reasoning topicMastery.ts/recencySignal.ts already use elsewhere).
function recencyRank(signal: QuestionSignal): number {
  return signal.recency ? recencyPriorityIndex(signal.recency) : recencyPriorityIndex("never_practiced");
}

// Phase 26 §7/§8 — the single entry point. Deterministic: the same
// questions + signals + recentlyShownIds always produce the same order,
// no Math.random anywhere (the "exploration" §7 asks for comes from the
// discovery TIER itself always being present and never emptied out, not
// from randomizing the order within it).
export function buildQuestionFeedRanking(params: BuildQuestionFeedRankingParams): Question[] {
  const { questions, signalsByQuestionId, recentlyShownIds } = params;

  // Array.prototype.sort is a STABLE sort in every JS engine this app
  // targets (guaranteed since ES2019) — ties that fall through every
  // comparator below keep their original (server) order, exactly the same
  // "stable tiebreak" reasoning learningInsights.ts's compareTopicsBy
  // already documents.
  return [...questions].sort((a, b) => {
    const signalA = signalsByQuestionId.get(a.id) ?? NO_SIGNAL;
    const signalB = signalsByQuestionId.get(b.id) ?? NO_SIGNAL;

    const tierDelta = tierOf(signalA) - tierOf(signalB);
    if (tierDelta !== 0) return tierDelta;

    // Within a tier: a not-recently-shown question always beats a
    // recently-shown one — deprioritized, never excluded.
    const seenA = recentlyShownIds.has(a.id) ? 1 : 0;
    const seenB = recentlyShownIds.has(b.id) ? 1 : 0;
    if (seenA !== seenB) return seenA - seenB;

    const recencyDelta = recencyRank(signalA) - recencyRank(signalB);
    if (recencyDelta !== 0) return recencyDelta;

    return 0;
  });
}
