import { StudyOutcome, StudyStatus } from "@features/study/domain/studyTypes";
import {
  buildLearningState,
  LearningState,
  LearningStateInput,
  MIN_OUTCOMES_FOR_CONFIDENT_STATE,
  REPEATED_STRUGGLE_MIN_EVENTS,
} from "@features/study/services/learningState";
import { resolveOutcomeHistory } from "@features/study/services/outcomeCounters";

// Phase 44 — did the intervention actually work?
//
// Phase 43 turned a diagnosis into a targeted assignment (see
// teacherIntervention.ts). Nothing then measured the result: a teacher who
// intervened on "Denklemler" three weeks ago had no way to tell a student
// who climbed out of it from one who is still exactly as stuck, short of
// re-reading the same raw dashboard they had before intervening.
//
// Pure, Firebase/React-free and deterministic, exactly like its Phase 41/42/43
// siblings. It adds NO collection, NO Cloud Function and NO stored snapshot:
// every value below is derived from two records the teacher's screens already
// load — the assignment's own frozen `questionOutcomes` (assignmentTypes.ts)
// and the student's live study items.
//
// WHY "PREVIOUS STATE" CAN BE RECONSTRUCTED AT ALL
//
// Nothing stores what a student's learning state was on the day of the
// intervention, and the cumulative counters (Phase 41) are lifetime totals
// with no timestamps — you cannot subtract "what happened since" out of them.
// The one honest record of that moment is the assignment's own
// `questionOutcomes`, which freezes the outcome of each question's FIRST
// completion inside that assignment and is never rewritten afterward
// (assignmentTypes.ts's own doc comment). That frozen record is what
// `resolveStateAtIntervention` reads, and it is the ONLY thing this file
// treats as "before".
//
// WHAT "STRUGGLE" MEANS HERE, AND WHY IT DIFFERS FROM assignmentOutcomeInsights
//
// `struggled` only — deliberately NOT struggled + again, even though the
// sibling assignment-scope engine (assignmentOutcomeInsights.ts's
// isStruggleOutcome) counts both. The reason is that this file's output is a
// `LearningState`, compared directly against a `LearningState` produced by
// buildLearningState — and that classifier counts `struggled` alone, for the
// reasons learningState.ts documents ("again" is a request to see the card
// again in ten minutes, not a report of difficulty). Using the broader rule
// on one side of a comparison and the narrower one on the other would make
// "persistent_struggle" mean two different things inside a single verdict,
// which is exactly the drift Phase 41/42 kept one definition to avoid.

export type InterventionEffectiveness =
  // The state moved in a better direction, with real post-intervention work
  // behind it.
  | "improved"
  // Real post-intervention work, and the state is exactly where it was.
  | "no_change"
  // Real post-intervention work, and the state moved in a worse direction.
  | "worsened"
  // No verdict is honest: either side is unknown, or nothing has been
  // studied since the intervention at all.
  | "insufficient_data";

// How much post-intervention evidence stands behind the verdict. Never a
// percentage or a weight — a bucket over a real count of questions actually
// reviewed since, same "categorical, structural, explainable" convention
// AttentionCategory and MasteryBand already follow.
export type InterventionConfidence = "high" | "medium" | "low";

// Where two LearningStates sit relative to each other. `insufficient_data`
// is deliberately unrankable (null): it is an absence of evidence, and
// comparing it against a real state would manufacture a direction out of
// nothing.
//
// The order between `recovering` and `one_off_struggle` is the one judgement
// call here, and it is set to the CONSERVATIVE reading. Because the counters
// are monotonic, the only way a question moves from one_off_struggle to
// recovering is by being struggled a SECOND time and then solved — the
// student now has a repeated-struggle pattern they did not have before.
// Ranking `recovering` below `one_off_struggle` reports that as "worsened"
// rather than crediting the intervention with a recovery from a pattern the
// intervention itself preceded.
const STATE_RANK: Readonly<Record<LearningState, number | null>> = {
  persistent_struggle: 0,
  recovering: 1,
  one_off_struggle: 2,
  stable: 3,
  insufficient_data: null,
};

// At least this many of the intervention's questions must have been reviewed
// since it was created before the verdict is called "high" confidence.
// Reuses learningState.ts's own bar for a trustworthy positive claim rather
// than inventing a second "enough evidence" number.
const MIN_REVIEWS_FOR_HIGH_CONFIDENCE = MIN_OUTCOMES_FOR_CONFIDENT_STATE;

// Fixed, deterministic Turkish templates — never generated text, same
// convention as studentAttention.ts's REASONS and learningMoment.ts. Every
// sentence states a checkable fact about the data, nothing interpretive.
const EXPLANATIONS = {
  noEvidence: "Müdahaleden bu yana bu sorularda çalışma yok",
  unknownBefore: "Müdahale öncesi durum için yeterli veri yok",
  unknownAfter: "Şu anki durum için yeterli veri yok",
  improvedStable: "Müdahale sonrası öğrenci bu soruları kavradı",
  improvedRecovering: "Müdahale sonrası öğrenci toparlanmaya başladı",
  improved: "Müdahale sonrası öğrencinin durumu iyileşti",
  noChange: "Müdahale sonrası çalışma var, ancak durum değişmedi",
  worsened: "Müdahale sonrası öğrencinin durumu geriledi",
} as const;

function isStruggleOutcome(outcome: StudyOutcome): boolean {
  return outcome === "struggled";
}

// The state the intervention itself recorded, read off the assignment's
// frozen per-question outcomes.
//
// TOPIC scope, not per-question scope — a deliberate difference from
// buildLearningState, which classifies ONE question's whole history. This
// record holds at most one outcome per question, so "repeated" here means
// "struggled on two of the questions this intervention covered", not
// "struggled twice on the same question". Both are the same claim at the
// level the intervention operates on (a topic), and both use the same
// REPEATED_STRUGGLE_MIN_EVENTS bar rather than a second threshold.
//
// Can never return "recovering": that state requires a standing solve after
// a struggle history, and a record with one frozen outcome per question
// carries no notion of "since". Callers must not read its absence as
// evidence the student was not recovering.
export function resolveStateAtIntervention(outcomes: readonly StudyOutcome[]): LearningState {
  // 1 — the student never completed a single question inside the
  // intervention. There is no record of that moment, and a student who did
  // nothing must never be classified as struggling on that basis.
  if (outcomes.length === 0) return "insufficient_data";

  const struggledCount = outcomes.filter(isStruggleOutcome).length;

  // 2 — difficulty reported on more than one of the intervention's own
  // questions.
  if (struggledCount >= REPEATED_STRUGGLE_MIN_EVENTS) return "persistent_struggle";

  // 3 — a single struggle is a slip, not a pattern (verbatim the rule
  // learningState.ts applies to one question's history).
  if (struggledCount > 0) return "one_off_struggle";

  // 4 — no struggle at all, but a positive claim still needs a real sample:
  // "solved the one question they opened" is not a track record.
  return outcomes.length >= MIN_OUTCOMES_FOR_CONFIDENT_STATE ? "stable" : "insufficient_data";
}

// One question the intervention covered, carrying both sides of the
// comparison. Structural on purpose — this file never imports the assignment
// or study-item document types, so it stays testable without either.
export interface InterventionQuestionEvidence {
  questionId: string;
  // The outcome frozen inside the assignment submission at the moment this
  // question was first completed there. null when the student never
  // completed it inside the intervention — an absence, never a zero.
  outcomeAtIntervention: StudyOutcome | null;
  // Everything buildLearningState needs about the question TODAY. null when
  // the student has no study item for it, or its counters are not
  // trustworthy (Phase 41's completeness rule — the caller resolves that and
  // passes null rather than substituting zeros).
  current: LearningStateInput | null;
  // Epoch ms of the student's most recent review of this question, null if
  // never reviewed. This is the ONLY thing that establishes whether anything
  // happened AFTER the intervention.
  lastReviewedAt: number | null;
}

export interface InterventionEffectivenessInput {
  // The assignment that carried the intervention (assignmentTypes.ts's
  // Assignment.id). No separate intervention record exists or is created.
  interventionId: string;
  // Epoch ms the intervention was created — the line "since" is measured
  // from.
  interventionAt: number;
  questions: readonly InterventionQuestionEvidence[];
}

export interface InterventionEffectivenessResult {
  interventionId: string;
  previousState: LearningState;
  currentState: LearningState;
  effectiveness: InterventionEffectiveness;
  confidence: InterventionConfidence;
  explanation: string;
  // The real count behind `confidence` — exposed so a caller can show the
  // evidence rather than only the verdict, the same way
  // AssignmentOutcomeInsights exposes its raw counts alongside its
  // effectiveness enum.
  reviewedSinceCount: number;
}

// The worst rankable state across the intervention's questions.
//
// Worst-wins, not an average: the topic is not resolved while any of its
// questions is still stuck, and averaging would let two mastered questions
// hide one the student cannot do at all — the exact failure Phase 42 exists
// to make visible. Questions with no trustworthy current reading contribute
// nothing (they cannot make the verdict better OR worse), and when none of
// them does, the answer is honestly "insufficient_data".
function aggregateCurrentState(questions: readonly InterventionQuestionEvidence[]): LearningState {
  let worst: LearningState = "insufficient_data";
  let worstRank: number | null = null;

  for (const question of questions) {
    if (!question.current) continue;
    const state = buildLearningState(question.current);
    const rank = STATE_RANK[state];
    if (rank === null) continue;
    if (worstRank === null || rank < worstRank) {
      worstRank = rank;
      worst = state;
    }
  }

  return worst;
}

function resolveConfidence(
  effectiveness: InterventionEffectiveness,
  reviewedSinceCount: number,
): InterventionConfidence {
  // A non-verdict is never anything but low confidence — there is no
  // conclusion for evidence to support.
  if (effectiveness === "insufficient_data") return "low";
  return reviewedSinceCount >= MIN_REVIEWS_FOR_HIGH_CONFIDENCE ? "high" : "medium";
}

// Ordered, first match wins — same shape as every sibling classifier, so
// there is exactly one path to every sentence.
function resolveExplanation(params: {
  previousState: LearningState;
  currentState: LearningState;
  effectiveness: InterventionEffectiveness;
  reviewedSinceCount: number;
}): string {
  const { previousState, currentState, effectiveness, reviewedSinceCount } = params;

  // The most useful thing to tell a teacher about a verdict-less
  // intervention is WHY there is no verdict, and "nobody has studied since"
  // is both the most common cause and the only one they can act on.
  if (reviewedSinceCount === 0) return EXPLANATIONS.noEvidence;
  if (previousState === "insufficient_data") return EXPLANATIONS.unknownBefore;
  if (currentState === "insufficient_data") return EXPLANATIONS.unknownAfter;

  if (effectiveness === "improved") {
    if (currentState === "stable") return EXPLANATIONS.improvedStable;
    if (currentState === "recovering") return EXPLANATIONS.improvedRecovering;
    return EXPLANATIONS.improved;
  }
  if (effectiveness === "worsened") return EXPLANATIONS.worsened;
  return EXPLANATIONS.noChange;
}

// The single entry point: one intervention, one student. Deterministic — the
// same input always produces the same verdict, and nothing here reads a
// clock, a network or a module-level cache.
export function buildInterventionEffectiveness(
  input: InterventionEffectivenessInput,
): InterventionEffectivenessResult {
  const { interventionId, interventionAt, questions } = input;

  const previousState = resolveStateAtIntervention(
    questions
      .map((question) => question.outcomeAtIntervention)
      .filter((outcome): outcome is StudyOutcome => outcome !== null),
  );
  const currentState = aggregateCurrentState(questions);

  // What actually happened AFTER the intervention. A non-finite
  // interventionAt cannot establish "since" for anything, so it yields zero
  // evidence — the conservative direction, never a verdict built on an
  // unusable boundary.
  const hasUsableBoundary = Number.isFinite(interventionAt);
  const reviewedSinceCount = hasUsableBoundary
    ? questions.filter(
        (question) => question.lastReviewedAt !== null && question.lastReviewedAt > interventionAt,
      ).length
    : 0;

  const previousRank = STATE_RANK[previousState];
  const currentRank = STATE_RANK[currentState];

  let effectiveness: InterventionEffectiveness;
  if (previousRank === null || currentRank === null || reviewedSinceCount === 0) {
    // Either side unknown, or nothing studied since: the states may well
    // differ, but nothing connects that difference to the intervention.
    effectiveness = "insufficient_data";
  } else if (currentRank > previousRank) {
    effectiveness = "improved";
  } else if (currentRank < previousRank) {
    effectiveness = "worsened";
  } else {
    effectiveness = "no_change";
  }

  return {
    interventionId,
    previousState,
    currentState,
    effectiveness,
    confidence: resolveConfidence(effectiveness, reviewedSinceCount),
    explanation: resolveExplanation({
      previousState,
      currentState,
      effectiveness,
      reviewedSinceCount,
    }),
    reviewedSinceCount,
  };
}

// ---------------------------------------------------------------------------
// Preparing the input — the pure half of what the hook does.
//
// Everything below turns records a teacher screen ALREADY holds into
// buildInterventionEffectiveness's input. It is kept here, beside the
// classifier it feeds, for the same reason teacherIntervention.ts groups its
// four resolvers in one file: they are one concern (this verdict's own input
// contract), and splitting them would put the shaping rules a reader needs
// in a different file from the rule they serve.
// ---------------------------------------------------------------------------

// The minimal shape an intervention needs from an assignment document — kept
// structural so this file never imports the assignments domain type, exactly
// as hasRecentTopicIntervention above already does. A real `Assignment` is
// assignable to it as-is.
export interface InterventionAssignment {
  id: string;
  // Carried purely so a caller can name the intervention it is reporting on
  // without a second lookup — never read by any rule below.
  title: string;
  createdAt: number;
  status: string;
  targetStudentIds: readonly string[];
  questionIds: readonly string[];
}

// Which assignment counts as "the intervention" for one student.
//
// Drafts are excluded: a draft was never delivered, so it cannot have had an
// effect to measure. Assignments that never targeted this student are
// excluded for the same reason — `targetStudentIds` is a creation-time
// snapshot (assignmentTypes.ts), so this is the real, checkable record of
// who the intervention was actually for.
//
// Most recent first, then id as a deterministic tiebreak — the same
// tiebreak convention resolveStudentInterventionTopic and
// dailyPracticePlan.ts already use, so two assignments created in the same
// millisecond always resolve the same way call after call.
//
// Returns null when this student has no delivered assignment at all. The
// caller then renders nothing rather than an effectiveness card about an
// intervention that never happened.
export function selectMostRecentIntervention(
  assignments: readonly InterventionAssignment[],
  studentUid: string,
): InterventionAssignment | null {
  return (
    [...assignments]
      .filter((assignment) => assignment.status !== "draft")
      .filter((assignment) => assignment.targetStudentIds.includes(studentUid))
      .sort((a, b) => {
        if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
        return a.id.localeCompare(b.id);
      })[0] ?? null
  );
}

// The minimal shape needed from one live study item. Mirrors the fields
// StudyItem already carries (studyService.ts); structural for the same
// reason as above, and so this file stays free of even a type-only import
// from a module that talks to Firebase.
export interface InterventionStudyItem {
  questionId: string;
  status: StudyStatus;
  lastOutcome: StudyOutcome;
  successfulReviews: number;
  attemptCount: number;
  // Optional/nullable exactly as on StudyItem — absent on any document
  // written before Phase 41's counters existed.
  solvedCount?: number | null;
  struggledCount?: number | null;
  againCount?: number | null;
  // 0 when never reviewed, same convention studentPerformance.ts reads it by.
  lastReviewedAt: number;
}

// Joins the two records into the per-question evidence the classifier takes.
//
// Driven by the assignment's OWN questionIds, never by whatever study items
// happen to exist: a question the student was assigned but never opened must
// still appear (as an absence on both sides), because dropping it would
// quietly shrink the intervention to only the parts that went well.
//
// Every "unknown" here stays null rather than becoming a zero — Phase 41's
// completeness rule is applied through resolveOutcomeHistory, so an item
// whose counters cannot account for its whole history contributes no
// current reading at all instead of a fabricated one.
export function toInterventionEvidence(params: {
  questionIds: readonly string[];
  questionOutcomes: Readonly<Record<string, StudyOutcome>>;
  studyItems: readonly InterventionStudyItem[];
}): InterventionQuestionEvidence[] {
  const { questionIds, questionOutcomes, studyItems } = params;
  const itemsByQuestionId = new Map(studyItems.map((item) => [item.questionId, item]));

  return questionIds.map((questionId) => {
    const item = itemsByQuestionId.get(questionId) ?? null;
    return {
      questionId,
      outcomeAtIntervention: questionOutcomes[questionId] ?? null,
      current: item
        ? {
            history: resolveOutcomeHistory({
              attemptCount: item.attemptCount,
              solvedCount: item.solvedCount ?? null,
              struggledCount: item.struggledCount ?? null,
              againCount: item.againCount ?? null,
            }),
            lastOutcome: item.lastOutcome,
            status: item.status,
            successfulReviews: item.successfulReviews,
          }
        : null,
      // 0 means "never reviewed" on a StudyItem — carried through as the
      // absence it is, so it can never be compared as a real timestamp.
      lastReviewedAt: item && item.lastReviewedAt > 0 ? item.lastReviewedAt : null,
    };
  });
}
