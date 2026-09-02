import { StudyOutcome } from "../domain/studyTypes";

// Phase 66 — what actually happened in the session the student just finished.
//
// SESSION-BOUND, AND ONLY SESSION-BOUND
//
// Every number and every sentence here comes from outcomes this session
// confirmed, in the order the student produced them. Nothing is reconstructed
// by scanning studyEvents for "everything in the last twenty minutes":
// timestamp proximity is not session identity, and a summary built that way
// would silently absorb work from a previous sitting.
//
// That is also why this can say something Phase 56 could not. Phase 56 refused
// to draw an ordered trail from lifetime counters because the order genuinely
// was not known. Within one session it IS known — the receipt is appended as
// each outcome is confirmed — so "zorlanmanın ardından çözüm görüldü" is a
// read of real sequence rather than an inference.
//
// LIFETIME EVIDENCE STAYS OUT
//
// Nothing here blends in cumulative counters or daily totals. A student whose
// historical counters are unknown (the legacy case) still gets an honest
// account of the session they just did, and never a sentence implying a
// lifetime total the product cannot support.

/** One confirmed outcome, appended after the canonical write resolved. */
export interface SessionOutcomeReceipt {
  // The canonical logical identity of the outcome. Phase 59's idempotency key,
  // reused rather than reinvented, so a replayed success callback and a
  // retried write both collapse to one receipt.
  operationId: string;
  questionId: string;
  // "" when the question's metadata could not be resolved — the same legacy
  // convention the rest of the study feature uses. Such an outcome still
  // counts, it simply contributes no topic story.
  subject: string;
  topic: string;
  outcome: StudyOutcome;
}

export type SessionMomentKind = "recovery" | "repeated_struggle" | "steady" | "mixed";

export interface SessionTopicMoment {
  id: string;
  subject: string;
  topic: string;
  // The outcomes for this topic, in the order the student produced them.
  outcomes: StudyOutcome[];
  kind: SessionMomentKind;
  observation: string;
}

export interface SessionReflection {
  // How many outcomes were confirmed. Not the same as questions: answering one
  // question twice in a session is two outcomes.
  confirmedOutcomeCount: number;
  // How many DISTINCT questions those outcomes covered.
  distinctQuestionCount: number;
  solvedCount: number;
  struggledCount: number;
  againCount: number;
  // At most MAX_SESSION_MOMENTS, chosen deterministically.
  moments: SessionTopicMoment[];
  isEmpty: boolean;
}

// A closure screen, not a report. Two is enough to say something true about a
// session without turning the end of a study session into a dashboard.
export const MAX_SESSION_MOMENTS = 2;

// Below this, a topic's outcomes are shown as facts but carry no pattern
// sentence: one outcome is not a sequence, and calling it one would be the
// same overclaim Phase 56 was careful to avoid.
export const MIN_MOMENT_OUTCOMES = 2;

/** Appends one confirmed outcome, ignoring a replay of one already recorded.
 *
 *  Keyed on operationId because that is what the canonical write already uses
 *  to make itself idempotent: if the same logical outcome is delivered twice —
 *  a re-fired success callback, a retried request that had actually
 *  succeeded — the session must count it exactly once, for the same reason the
 *  server counts it once. */
export function appendSessionReceipt(
  receipts: readonly SessionOutcomeReceipt[],
  receipt: SessionOutcomeReceipt,
): SessionOutcomeReceipt[] {
  if (receipts.some((existing) => existing.operationId === receipt.operationId)) {
    return [...receipts];
  }
  return [...receipts, receipt];
}

function isStruggle(outcome: StudyOutcome): boolean {
  // "again" is a request to see the card again shortly, not a report of
  // difficulty — the same rule reviewScheduler, learningState and the Learning
  // Trail already apply. Treating it as a struggle here would make one
  // interaction mean two different things in two places.
  return outcome === "struggled";
}

function resolveMomentKind(outcomes: readonly StudyOutcome[]): SessionMomentKind | null {
  if (outcomes.length < MIN_MOMENT_OUTCOMES) return null;
  const last = outcomes[outcomes.length - 1];
  const earlier = outcomes.slice(0, -1);
  if (!last) return null;
  if (last === "solved" && earlier.some(isStruggle)) return "recovery";
  if (outcomes.every(isStruggle)) return "repeated_struggle";
  if (outcomes.every((outcome) => outcome === "solved")) return "steady";
  return "mixed";
}

// Fixed copy, scoped by "Bu çalışmada" so no sentence can be read as a claim
// about the student's overall grip on a topic. Observational only: none of
// these says the session caused anything, or that a topic is now learned.
const MOMENT_COPY: Readonly<Record<SessionMomentKind, string>> = {
  recovery: "Bu çalışmada zorlanmanın ardından çözüm görüldü.",
  repeated_struggle: "Bu çalışmada bu konuda zorlanma tekrar etti.",
  steady: "Bu çalışmada bu konuda çözümler arka arkaya geldi.",
  mixed: "Bu çalışmada sonuçlar karışık ilerledi.",
};

// Which moment is worth showing when a session touched several topics. A real
// recovery is the most useful thing to tell a student about; a repeated
// struggle is the next most useful. Steady and mixed rank last because they
// are the least actionable, not because they are less true.
const KIND_PRIORITY: Readonly<Record<SessionMomentKind, number>> = {
  recovery: 0,
  repeated_struggle: 1,
  steady: 2,
  mixed: 3,
};

export function buildSessionReflection(
  receipts: readonly SessionOutcomeReceipt[],
): SessionReflection {
  const solvedCount = receipts.filter((r) => r.outcome === "solved").length;
  const struggledCount = receipts.filter((r) => r.outcome === "struggled").length;
  const againCount = receipts.filter((r) => r.outcome === "again").length;

  const grouped = new Map<string, SessionOutcomeReceipt[]>();
  for (const receipt of receipts) {
    // An outcome whose topic never resolved still counts toward the totals
    // above, but contributes no topic story — grouping unrelated questions
    // under one "unknown" heading would invent adjacency that did not exist.
    if (!receipt.subject.trim() || !receipt.topic.trim()) continue;
    const key = `${receipt.subject}|${receipt.topic}`;
    const existing = grouped.get(key);
    if (existing) existing.push(receipt);
    else grouped.set(key, [receipt]);
  }

  const moments: SessionTopicMoment[] = [];
  for (const [id, group] of grouped) {
    const outcomes = group.map((receipt) => receipt.outcome);
    const kind = resolveMomentKind(outcomes);
    if (!kind) continue;
    const first = group[0] as SessionOutcomeReceipt;
    moments.push({
      id,
      subject: first.subject,
      topic: first.topic,
      outcomes,
      kind,
      observation: MOMENT_COPY[kind],
    });
  }

  // Deterministic: kind, then how much of the session the topic accounted for,
  // then the topic key. Insertion order is never relied on.
  moments.sort((a, b) => {
    const byKind = KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind];
    if (byKind !== 0) return byKind;
    if (a.outcomes.length !== b.outcomes.length) return b.outcomes.length - a.outcomes.length;
    return a.id.localeCompare(b.id);
  });

  return {
    confirmedOutcomeCount: receipts.length,
    distinctQuestionCount: new Set(receipts.map((r) => r.questionId)).size,
    solvedCount,
    struggledCount,
    againCount,
    moments: moments.slice(0, MAX_SESSION_MOMENTS),
    isEmpty: receipts.length === 0,
  };
}

// The student-facing label for one outcome. The internal enum never reaches
// the screen, and these reuse the wording the outcome controls already use so
// the summary names each result exactly as the student chose it.
const OUTCOME_LABEL: Readonly<Record<StudyOutcome, string>> = {
  solved: "Çözdüm",
  struggled: "Zorlandım",
  again: "Tekrar Çalıştım",
};

export function sessionOutcomeLabel(outcome: StudyOutcome): string {
  return OUTCOME_LABEL[outcome];
}

/** The headline for the session, counting the honest noun.
 *
 *  Says "sonuç" rather than "soru" whenever a question was answered more than
 *  once, because four outcomes across three questions is not four questions. */
export function sessionHeadline(reflection: SessionReflection): string {
  const { confirmedOutcomeCount, distinctQuestionCount } = reflection;
  if (confirmedOutcomeCount === 0) return "Bu çalışmada kayıtlı sonuç yok";
  if (confirmedOutcomeCount === distinctQuestionCount) {
    return `${distinctQuestionCount} soru üzerinde çalıştın`;
  }
  return `${confirmedOutcomeCount} çalışma sonucu kaydedildi`;
}
