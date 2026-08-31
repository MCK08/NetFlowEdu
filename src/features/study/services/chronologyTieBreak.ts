import {
  LearningEvent,
  MAX_TRAIL_EVENTS,
  resolveTrailShape,
  sortEventsChronologically,
  TrailShape,
} from "@features/learningStory/services/learningTrail";

// Phase 61 — verified chronology as the LAST tie-break in adaptive ranking.
//
// WHAT THIS IS ALLOWED TO DO
//
// Reorder two candidates that every stronger existing rule has already
// declared equivalent. Nothing else. It cannot move a question between tiers,
// cannot outrank a mastery or recency difference, and cannot outrank Phase
// 45's cumulative struggle comparison — see dailyPracticePlan.ts, where this
// runs strictly after all of those and strictly before the stable fallback.
//
// WHY IT REUSES PHASE 59's CLASSIFIER
//
// `resolveTrailShape` already decides what an ordered sequence means, and it
// already encodes two rules this must not restate: the minimum-evidence bar
// (a lone outcome is not a journey) and the treatment of "again" as a request
// to see the card again rather than a report of difficulty. Writing a second
// shape reader here would have created a competing definition of the same
// idea, free to drift from the Learning Trail the student is shown.
//
// NO SCORE, NO DECAY
//
// The output is an ordinal, not a weight. There is deliberately no half-life,
// no forgetting curve and no coefficient: those need a separately validated
// model, and this phase only claims to read the SHAPE of a recent sequence.

// The window a question's signal is read from — the same span the Learning
// Trail draws, so what ranked a question is exactly what the student would
// see if they opened its trail.
export const CHRONOLOGY_WINDOW = MAX_TRAIL_EVENTS;

export interface ChronologyProfile {
  // null when the recent sequence is too thin to mean anything. Never
  // substituted with a neutral shape — "we cannot say" is not "mixed".
  shape: TrailShape | null;
  eventCount: number;
  // The exact events this profile was derived from, so an explanation can be
  // tied to the same evidence that did the ranking.
  consideredEventIds: string[];
}

// Lower sorts first, matching the "lower is more urgent" convention
// masteryRankOf / recencyRankOf / questionStruggleRankOf already use.
//
// repeated_struggle → recovery → mixed → steady
//
// Recovery ranks above mixed deliberately: a sequence that struggled and then
// solved still carries real struggle evidence worth reinforcing, whereas a
// mixed sequence supports no reading at all. Neither ordering claims anything
// about mastery — both are only ever consulted between candidates already
// judged equivalent.
const SHAPE_URGENCY: Readonly<Record<TrailShape, number>> = {
  repeated_struggle: 0,
  recovery: 1,
  mixed: 2,
  steady: 3,
};

/** Indexes every candidate's recent chronology in ONE pass.
 *
 *  Built once per selection and reused for every comparison, rather than
 *  re-filtering the event list inside the comparator — a comparator runs
 *  O(n log n) times, so filtering there would turn a bounded read into
 *  needless repeated work. */
export function buildChronologyProfiles(
  events: readonly LearningEvent[],
): Map<string, ChronologyProfile> {
  const byQuestion = new Map<string, LearningEvent[]>();
  // Defensive de-duplication by event id. Phase 59 makes duplicate PERSISTED
  // events impossible (the id is derived from the operationId), so this
  // guards only against a duplicated client-side input array — it is not a
  // substitute for that guarantee and must never be relied on as one.
  const seen = new Set<string>();

  for (const event of events) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    // An event whose question is unknown to this candidate set simply never
    // matches one, so no association is guessed.
    const existing = byQuestion.get(event.questionId);
    if (existing) {
      existing.push(event);
    } else {
      byQuestion.set(event.questionId, [event]);
    }
  }

  const profiles = new Map<string, ChronologyProfile>();
  for (const [questionId, questionEvents] of byQuestion) {
    // Firestore returns these newest-first; normalising here means the shape
    // never depends on the order the query happened to deliver.
    const windowed = sortEventsChronologically(questionEvents).slice(-CHRONOLOGY_WINDOW);
    profiles.set(questionId, {
      shape: resolveTrailShape(windowed),
      eventCount: windowed.length,
      consideredEventIds: windowed.map((event) => event.id),
    });
  }
  return profiles;
}

/** The ordinal used by the comparator, or null when this candidate has no
 *  readable recent sequence. */
export function chronologyRankOf(profile: ChronologyProfile | undefined): number | null {
  if (!profile || !profile.shape) return null;
  return SHAPE_URGENCY[profile.shape];
}

/** Compares two candidates' chronology.
 *
 *  Returns 0 — "these are not distinguishable by chronology" — unless BOTH
 *  sides have a readable sequence.
 *
 *  Requiring both is the rollout-fairness rule, and it matters more than it
 *  looks: the event log only begins at Phase 59, so at rollout most questions
 *  have no chronology at all. Ranking a candidate ahead merely because it
 *  happens to have events would systematically favour whatever the student
 *  studied most recently after the upgrade, which is an artefact of the
 *  rollout date rather than evidence about their learning. */
export function compareChronology(
  a: ChronologyProfile | undefined,
  b: ChronologyProfile | undefined,
): number {
  const rankA = chronologyRankOf(a);
  const rankB = chronologyRankOf(b);
  if (rankA === null || rankB === null) return 0;
  return rankA - rankB;
}

// The structured reason a surface may translate. Deliberately NOT a Turkish
// string: the ranking layer states what it observed, and the presentation
// layer decides how to say it (and whether to say it at all).
export type ChronologyReason = "recent_repeated_struggle" | "recent_recovery";

/** Why chronology favoured this question — or null when it did not.
 *
 *  Only the two shapes that can actually PROMOTE a candidate produce a
 *  reason. "steady" and "mixed" can only ever push a question down or leave
 *  it alone, and explaining a deprioritisation to a student is noise. */
export function chronologyReasonFor(profile: ChronologyProfile | undefined): ChronologyReason | null {
  if (!profile?.shape) return null;
  if (profile.shape === "repeated_struggle") return "recent_repeated_struggle";
  if (profile.shape === "recovery") return "recent_recovery";
  return null;
}
