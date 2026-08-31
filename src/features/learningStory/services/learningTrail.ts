import { StudyOutcome } from "@features/study/domain/studyTypes";

// Phase 59 — turning real chronological events into a Learning Trail.
//
// Pure, deterministic, Firebase/React-free. Every function here operates on
// events that were actually recorded server-side; nothing is inferred from a
// counter, and no order is ever guessed.
//
// WHAT PHASE 56 COULD NOT DO, AND WHY THIS CAN
//
// Phase 56 refused to draw `Zorlandım → Zorlandım → Çözdüm` because the only
// available evidence was cumulative totals, which carry no order. Phase 59's
// events carry a server-authoritative `occurredAt`, so the sequence below is
// read, not reconstructed.

// One recorded outcome, as the client sees it. `subject`/`topic` are joined
// in by the caller from the shared question-metadata cache — the event
// document itself deliberately stores no question content (see
// functions/src/study/learningEvent.ts).
export interface LearningEvent {
  id: string;
  questionId: string;
  outcome: StudyOutcome;
  occurredAt: number;
  subject: string;
  topic: string;
}

// How many steps a trail shows. Small on purpose: this is a narrative beat in
// the Learning Story, not a history browser.
export const MAX_TRAIL_EVENTS = 4;

// The minimum number of real events before a trail is worth drawing at all.
// One lone outcome is not a journey, and rendering it as one would overstate
// what the evidence supports.
export const MIN_TRAIL_EVENTS = 2;

// Chronological, OLDEST → NEWEST.
//
// One direction, used everywhere, chosen because the trail reads as a story
// that ends where the student is now — the newest outcome is the conclusion,
// and the recovery copy below depends on "the last one" being visually last.
//
// The tie-break is deterministic (occurredAt, then event id) so two events
// written in the same millisecond can never swap places between renders and
// the order never depends on Firestore's return order.
export function sortEventsChronologically(events: readonly LearningEvent[]): LearningEvent[] {
  return [...events].sort((a, b) => {
    if (a.occurredAt !== b.occurredAt) return a.occurredAt - b.occurredAt;
    return a.id.localeCompare(b.id);
  });
}

// The events belonging to one topic, newest-last, capped.
//
// Matching is exact on subject AND topic — a legacy question whose metadata
// could not be resolved has "" for both (learningInsights.ts's own
// convention) and therefore never contaminates a real topic's trail.
export function selectTopicTrail(
  events: readonly LearningEvent[],
  subject: string,
  topic: string,
): LearningEvent[] {
  if (!subject || !topic) return [];
  const matching = events.filter((event) => event.subject === subject && event.topic === topic);
  // Sort first, THEN take the most recent window — taking first would keep
  // whichever events happened to arrive first from the query.
  return sortEventsChronologically(matching).slice(-MAX_TRAIL_EVENTS);
}

// Whether a trail carries enough real evidence to be shown as a sequence.
export function hasTrustworthyTrail(trail: readonly LearningEvent[]): boolean {
  return trail.length >= MIN_TRAIL_EVENTS;
}

// A display-only reading of the trail's SHAPE. Deliberately not a classifier:
// Phase 42's learning state remains the authoritative verdict about the
// student (see PHASE59 doc), and this only decides which observational
// sentence, if any, the trail itself may add as context.
export type TrailShape = "recovery" | "repeated_struggle" | "steady" | "mixed";

function isStruggle(outcome: StudyOutcome): boolean {
  // "again" is a request to see the card again shortly, not a report of
  // difficulty — the same rule learningState.ts and interventionEffectiveness.ts
  // already apply. Only "struggled" counts as a struggle here.
  return outcome === "struggled";
}

export function resolveTrailShape(trail: readonly LearningEvent[]): TrailShape | null {
  if (!hasTrustworthyTrail(trail)) return null;

  const last = trail[trail.length - 1];
  const earlier = trail.slice(0, -1);
  if (!last) return null;

  // Recovery: it ENDED on a solve, and there is at least one real struggle
  // before it. That is a genuine ordered fact about this sequence — it is not
  // a claim that the topic is now mastered.
  if (last.outcome === "solved" && earlier.some((event) => isStruggle(event.outcome))) {
    return "recovery";
  }
  if (trail.every((event) => isStruggle(event.outcome))) return "repeated_struggle";
  if (trail.every((event) => event.outcome === "solved")) return "steady";
  return "mixed";
}

// Fixed Turkish copy — never generated, never interpolated, and never causal.
// "mixed" deliberately has no sentence: a mixed sequence supports no honest
// summary beyond the trail the student can already see for themselves.
const SHAPE_COPY: Readonly<Record<TrailShape, string | null>> = {
  recovery: "Son çalışmalarda toparlanma görülüyor.",
  repeated_struggle: "Bu konuda üst üste zorlandın.",
  steady: "Son çalışmalarında istikrarlı gidiyorsun.",
  mixed: null,
};

export function trailInsightText(trail: readonly LearningEvent[]): string | null {
  const shape = resolveTrailShape(trail);
  if (!shape) return null;
  return SHAPE_COPY[shape];
}

// User-facing label for one step. The internal enum never reaches the UI.
const OUTCOME_LABEL: Readonly<Record<StudyOutcome, string>> = {
  solved: "Çözdüm",
  struggled: "Zorlandım",
  again: "Tekrar Çalıştım",
};

export function trailStepLabel(outcome: StudyOutcome): string {
  return OUTCOME_LABEL[outcome];
}
