import { StudentPerformanceSnapshot } from "./studentPerformance";

// Turns one student's already-computed StudentPerformanceSnapshot (itself
// built entirely from server-written StudyItem fields + the existing
// mastery/recency/trend engines — see studentPerformance.ts's own doc
// comment) into an EXPLAINABLE attention category + real-data reasons. This
// is a presentation/priority layer on top of that snapshot, not a second
// learning engine: it introduces no new signal that snapshot doesn't
// already carry, and computes no score, percentage, or weight of its own —
// every branch below is a direct, named fact about the data (a real
// struggle count, a real day-gap, the real trend enum), never an invented
// number.

export type AttentionCategory =
  | "needs_attention"
  | "watch"
  | "progressing"
  | "strong"
  | "insufficient_data";

export interface StudentAttentionInsight {
  category: AttentionCategory;
  // Fixed, deterministic Turkish templates — never generated text. Ordered
  // most-important-reason-first; a caller showing only one line uses
  // reasons[0].
  reasons: string[];
  // The single weak topic most responsible for this categorization, if any
  // — lets a caller offer a direct "bu konuya bak" action without a second
  // lookup. Null when no topic is implicated (e.g. a pure staleness or
  // insufficient-data case).
  implicatedTopic: { subject: string; topic: string } | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// A real sample, not "any struggle at all" — one struggled review out of
// one attempt is noise, not a pattern. Requires at least this many of the
// student's most-recent reviews (see RECENT_OUTCOMES_LIMIT) before a
// struggle RATIO is trusted for a "repeated struggle" verdict.
const MIN_RECENT_SAMPLE_FOR_STRUGGLE_SIGNAL = 3;
// Majority struggled among that real recent sample.
const SEVERE_RECENT_STRUGGLE_RATIO = 0.6;
// "Stale" — matches the phase brief's own "3 gündür tekrar yok" example.
const STALE_DAYS_THRESHOLD = 3;
// classifyStudentSupportTier's own existing, already-tested cutoffs
// (studentPerformance.ts) — reused verbatim rather than re-invented here,
// so the two categorical systems never silently disagree about what
// "low success" or "many weak topics" means.
const LOW_SUCCESS_RATE_PERCENT = 50;
const MANY_WEAK_TOPICS = 3;
const STRONG_SUCCESS_RATE_PERCENT = 80;

function daysSince(timestampMs: number, now: number): number {
  return Math.floor((now - timestampMs) / DAY_MS);
}

// Fixed templates, matching the phase brief's own examples verbatim where
// given. No interpolated "AI-sounding" language — every sentence states a
// real, checkable fact.
const REASONS = {
  repeatedStruggle: "Son çalışmalarında çoğunlukla zorlandı",
  staleReview: (days: number) => `${days} gündür tekrar yapmadı`,
  reviewDue: "Bu konuda tekrar zamanı geldi",
  declining: "Son dönemde performansı düşüyor",
  manyWeakTopics: "Birden fazla konuda zorlanıyor",
  lowSuccessRate: "Genel başarı oranı düşük",
  improving: "Son çalışmalarında iyileşme var",
  noActivity: "Bu sınıfta henüz çalışmadı",
  steady: "Düzenli ve istikrarlı ilerliyor",
  strong: "Bu sınıfta güçlü durumda",
};

// Deterministic, priority-ordered (§4): a student lands in exactly ONE
// category — the first rule below that matches, not the "worst" of several
// independently-true ones. Order matters and is the whole point: severe
// repeated struggle always outranks a merely stale student, which always
// outranks a declining-but-otherwise-fine one, and so on.
export function buildStudentAttentionInsight(
  snapshot: StudentPerformanceSnapshot,
  now: number,
): StudentAttentionInsight {
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const topFocusTopic = snapshot.weakTopics[0] ?? null;
  const implicatedTopic = topFocusTopic
    ? { subject: topFocusTopic.subject, topic: topFocusTopic.topic }
    : null;

  // Never studied anything from this class at all — no signal exists to
  // categorize on, so this is not "watch" or "normal", it's genuinely
  // unknown.
  if (snapshot.totalCount === 0) {
    return { category: "insufficient_data", reasons: [REASONS.noActivity], implicatedTopic: null };
  }

  // 1. Severe repeated struggle — a real, sufficiently-sized recent sample
  // where the majority of reviews were struggles.
  const recentSample = snapshot.recentOutcomes;
  if (recentSample.length >= MIN_RECENT_SAMPLE_FOR_STRUGGLE_SIGNAL) {
    // "again" and "struggled" both count — both are non-solved outcomes
    // (see studyTypes.ts); "solved" is the only outcome that isn't part of
    // a struggle pattern.
    const struggledCount = recentSample.filter((outcome) => outcome === "struggled" || outcome === "again").length;
    if (struggledCount / recentSample.length >= SEVERE_RECENT_STRUGGLE_RATIO) {
      return { category: "needs_attention", reasons: [REASONS.repeatedStruggle], implicatedTopic };
    }
  }

  // 1b. Same severity tier, different real evidence: a low overall success
  // rate or spread across many weak topics — the exact thresholds
  // classifyStudentSupportTier already uses for "needs_support".
  if (snapshot.successRatePercent !== null && snapshot.successRatePercent < LOW_SUCCESS_RATE_PERCENT) {
    return { category: "needs_attention", reasons: [REASONS.lowSuccessRate], implicatedTopic };
  }
  if (snapshot.weakTopics.length >= MANY_WEAK_TOPICS) {
    return { category: "needs_attention", reasons: [REASONS.manyWeakTopics], implicatedTopic };
  }

  // 2. Stale while a real backlog/weak topic is waiting — "stopped
  // engaging", not merely "has some due items" (which is normal for every
  // spaced-repetition student and would false-positive almost everyone).
  const daysStale = snapshot.lastStudiedAt !== null ? daysSince(snapshot.lastStudiedAt, safeNow) : null;
  if (daysStale !== null && daysStale >= STALE_DAYS_THRESHOLD && (snapshot.dueCount > 0 || snapshot.weakTopics.length > 0)) {
    return { category: "needs_attention", reasons: [REASONS.staleReview(daysStale)], implicatedTopic };
  }

  // 3. Declining trend, without meeting the severity bar above.
  if (snapshot.trend === "declining") {
    return { category: "watch", reasons: [REASONS.declining], implicatedTopic };
  }

  // 4. A real review backlog waiting, even without staleness or decline.
  if (snapshot.dueCount > 0 && snapshot.weakTopics.length > 0) {
    return { category: "watch", reasons: [REASONS.reviewDue], implicatedTopic };
  }

  // 5. Genuinely too little data to say more than "started, but early".
  if (snapshot.successRatePercent === null) {
    return { category: "insufficient_data", reasons: [REASONS.noActivity], implicatedTopic: null };
  }

  // 6. Improving trend — real, recent evidence of getting better.
  if (snapshot.trend === "improving") {
    return { category: "progressing", reasons: [REASONS.improving], implicatedTopic };
  }

  // 7. Strong — matches classifyStudentSupportTier's own "strong" bar.
  if (snapshot.successRatePercent >= STRONG_SUCCESS_RATE_PERCENT && snapshot.weakTopics.length === 0 && snapshot.dueCount === 0) {
    return { category: "strong", reasons: [REASONS.strong], implicatedTopic: null };
  }

  // Default: real data, nothing above flagged it — steady, unremarkable
  // progress, never silently dropped into "needs_attention" for lack of a
  // better bucket.
  return { category: "progressing", reasons: [REASONS.steady], implicatedTopic };
}

const ATTENTION_PRIORITY: readonly AttentionCategory[] = [
  "needs_attention",
  "watch",
  "insufficient_data",
  "progressing",
  "strong",
];

function attentionPriorityIndex(category: AttentionCategory): number {
  return ATTENTION_PRIORITY.indexOf(category);
}

export interface StudentAttentionCard {
  studentUid: string;
  displayName: string;
  insight: StudentAttentionInsight;
  // Carried through so a caller can break ties / render a rate without a
  // second lookup — not itself part of the ordering logic below beyond the
  // documented tiebreak.
  successRatePercent: number | null;
}

// Stable priority ordering (§4): category priority first, then LOWEST
// success rate first within a category (mirrors
// sortStudentPerformanceCards's own tiebreak exactly, so the two lists
// never disagree about which of two equally-categorized students is more
// urgent), then displayName as the final deterministic tiebreak. Every
// student appears exactly once — this only reorders the array the caller
// already built one insight per student for for.
export function sortStudentAttentionCards(
  cards: readonly StudentAttentionCard[],
): StudentAttentionCard[] {
  return [...cards].sort((a, b) => {
    const priorityDelta =
      attentionPriorityIndex(a.insight.category) - attentionPriorityIndex(b.insight.category);
    if (priorityDelta !== 0) return priorityDelta;

    const rateA = a.successRatePercent ?? 0;
    const rateB = b.successRatePercent ?? 0;
    if (rateA !== rateB) return rateA - rateB;

    return a.displayName.localeCompare(b.displayName, "tr");
  });
}
