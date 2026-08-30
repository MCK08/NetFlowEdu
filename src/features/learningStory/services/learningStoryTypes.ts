// Phase 56 — the presentation vocabulary Learning Story speaks.
//
// Deliberately types + copy-free structure only. Every string a screen shows
// is produced by the two builders next to this file, so the rules that decide
// what may be CLAIMED live in one testable place instead of in JSX.
//
// WHAT THIS MODEL MAY NOT CARRY
//
// No score, no percentage, no rank. Learning here is multi-dimensional and
// the product has no validated single-number model of it, so inventing one
// would be a claim the data cannot support.
//
// No time window either. The cumulative counters this feature reads
// (outcomeCounters.ts) are lifetime totals with no per-outcome timestamps, so
// nothing downstream is allowed to say "this week" or "son 7 gün". The one
// genuinely ordered fact available per question is which outcome was the most
// recent, and that is carried explicitly as `lastOutcome` rather than being
// smuggled into prose.

import { StudyOutcome } from "@features/study/domain/studyTypes";

export type LearningStoryMomentKind =
  // A real struggle history whose most recent outcome is a standing solve.
  | "recovery"
  // Enough recorded success, no unresolved struggle pattern.
  | "strength"
  // The same question keeps going badly.
  | "needs_attention"
  // Exactly one struggled outcome ever — a slip, deliberately not dramatized.
  | "one_off";

// How much the underlying evidence supports the claim.
//
// There is deliberately no "unknown" level. Phase 42 already refuses to
// classify a question whose counters are incomplete — it returns
// insufficient_data, which produces no moment at all — so a moment that
// exists always has fully-counted evidence behind it. A third level would
// describe a state this pipeline cannot reach.
export type LearningStoryEvidenceLevel = "strong" | "moderate";

export interface LearningStoryAction {
  label: string;
  subject: string;
  topic: string;
}

export interface LearningStoryMoment {
  // Stable across renders: derived from subject+topic, never an index or a
  // random id, so the list cannot reshuffle between renders.
  id: string;
  kind: LearningStoryMomentKind;
  subject: string;
  topic: string;
  // One human sentence about what the evidence shows.
  title: string;
  // The supporting evidence, in words. Never contains an internal classifier
  // name and never a number the counters could not prove.
  description: string;
  evidenceLevel: LearningStoryEvidenceLevel;
  // Always present: a moment without fully-counted evidence is not emitted.
  // That is what keeps a legacy item from ever being described as "0 kez".
  evidence: LearningStoryEvidence;
  // The single ordered fact the data does support: what the most recent
  // outcome on the topic's representative question was.
  lastOutcome: StudyOutcome;
  action: LearningStoryAction | null;
}

// A COMPOSITION, explicitly not a timeline.
//
// These are lifetime totals per outcome type. They are safe to show as
// proportions ("çoğunlukla zorlandın") and unsafe to show as a sequence,
// because no per-outcome ordering is stored anywhere in the product.
export interface LearningStoryEvidence {
  solved: number;
  struggled: number;
  again: number;
  total: number;
}

export interface StudentLearningStory {
  headline: string;
  // Present only when there is genuinely something to summarize; the screen
  // renders the first-run state instead when this is null.
  subheadline: string | null;
  moments: LearningStoryMoment[];
  isFirstRun: boolean;
}

export type TeacherStorySectionKind =
  | "recovering"
  | "persistent_struggle"
  | "watch"
  | "progressing";

export interface TeacherStorySection {
  id: TeacherStorySectionKind;
  title: string;
  // "2 öğrencide toparlanma sinyali görülüyor." — the count is real or the
  // section is not emitted at all.
  description: string;
  studentCount: number;
  // The students behind the count, so a caller can route into existing
  // per-student intelligence without a second lookup.
  studentUids: string[];
}

export interface TeacherLearningStory {
  headline: string;
  subheadline: string | null;
  sections: TeacherStorySection[];
  isFirstRun: boolean;
}
