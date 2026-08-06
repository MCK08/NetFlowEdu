import { isStudyOutcome, isStudyStatus, StudyOutcome, StudyStatus, StudySource } from "../domain/studyTypes";

// Pure, defensive parser for a raw users/{uid}/studyItems/{questionId}
// document. Raw Firestore data NEVER reaches the UI — a hand-edited,
// partially-migrated or future-schema document must degrade safely rather
// than render "undefined" or crash a screen.
//
// Deliberately carries no question content: a study item stores only
// scheduling state (see functions/src/study/studyTypes.ts), so nothing here
// can leak private/class material even if the question itself is unreadable.

export interface HydratedStudyItem {
  questionId: string;
  status: StudyStatus;
  lastOutcome: StudyOutcome | null;
  intervalDays: number;
  successfulReviews: number;
  attemptCount: number;
  nextReviewAt: number | null;
  source: StudySource;
}

function nonNegativeInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

function parseSource(value: unknown): StudySource {
  if (value === "class") return "class";
  if (value === "private") return "private";
  return "public";
}

/**
 * Normalizes a raw document into the shape the UI consumes.
 *
 * Returns null for "no such item" (the student has never studied this
 * question) — which is a completely normal state, not an error.
 *
 * A malformed document is NORMALIZED rather than rejected: an unrecognized
 * status falls back to "learning" (the most conservative bucket — it means
 * "keep showing me this"), and an unrecognized outcome becomes null rather
 * than a wrong claim about what the student reported.
 */
export function parseStudyItem(questionId: string, raw: unknown): HydratedStudyItem | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;

  return {
    questionId,
    status: isStudyStatus(data.status) ? data.status : "learning",
    lastOutcome: isStudyOutcome(data.lastOutcome) ? data.lastOutcome : null,
    intervalDays: nonNegativeInt(data.intervalDays),
    successfulReviews: nonNegativeInt(data.successfulReviews),
    attemptCount: nonNegativeInt(data.attemptCount),
    // null (not 0) when absent/garbage — 0 would read as "due right now",
    // which is a meaningfully different claim.
    nextReviewAt:
      typeof data.nextReviewAt === "number" && Number.isFinite(data.nextReviewAt)
        ? data.nextReviewAt
        : null,
    source: parseSource(data.source),
  };
}

/**
 * Adapts a queue StudyItem (read as a list, already typed) to the shape the
 * shared controls consume.
 *
 * The queue and the question surfaces reach study state by different routes —
 * a paginated query vs a single document read — but they must DESCRIBE it
 * identically. Narrowing here rather than widening the control's props keeps
 * one presentation path instead of two.
 */
export function toHydratedStudyItem(item: {
  questionId: string;
  status: StudyStatus;
  lastOutcome: StudyOutcome;
  intervalDays: number;
  successfulReviews: number;
  attemptCount: number;
  nextReviewAt: number;
  source: StudySource;
}): HydratedStudyItem {
  return {
    questionId: item.questionId,
    status: item.status,
    lastOutcome: item.lastOutcome,
    intervalDays: nonNegativeInt(item.intervalDays),
    successfulReviews: nonNegativeInt(item.successfulReviews),
    attemptCount: nonNegativeInt(item.attemptCount),
    nextReviewAt: Number.isFinite(item.nextReviewAt) ? item.nextReviewAt : null,
    source: item.source,
  };
}

// Applies the server's authoritative response to the locally-held item. The
// SERVER decides status/interval/nextReviewAt — this never recomputes them,
// it only records what came back.
export function applyOutcomeResult(
  previous: HydratedStudyItem | null,
  questionId: string,
  outcome: StudyOutcome,
  result: {
    status: StudyStatus;
    intervalDays: number;
    successfulReviews: number;
    nextReviewAt: number;
  },
): HydratedStudyItem {
  return {
    questionId,
    status: result.status,
    lastOutcome: outcome,
    intervalDays: nonNegativeInt(result.intervalDays),
    successfulReviews: nonNegativeInt(result.successfulReviews),
    // First-ever review creates the item, so attemptCount starts at 1.
    attemptCount: (previous?.attemptCount ?? 0) + 1,
    nextReviewAt: Number.isFinite(result.nextReviewAt) ? result.nextReviewAt : null,
    source: previous?.source ?? "public",
  };
}

// Whether an async hydration result may still be applied. Extracted as a
// pure predicate so the "stale response overwrote the new question" failure
// mode is directly testable without mounting React.
export function shouldApplyHydration(params: {
  requestedQuestionId: string;
  currentQuestionId: string;
  requestGeneration: number;
  currentGeneration: number;
}): boolean {
  return (
    params.requestedQuestionId === params.currentQuestionId &&
    params.requestGeneration === params.currentGeneration
  );
}

/**
 * State to keep when hydration starts for `questionId`.
 *
 * Held state belonging to a DIFFERENT question is dropped immediately rather
 * than left on screen for the duration of the fetch. `isHydrating` does not
 * cover this: the outcome buttons read `item.lastOutcome` directly, so in the
 * class feed a swipe from a question marked "Çözdüm" onto an unstudied one
 * showed that outcome selected on the new card until the read returned.
 *
 * State for the SAME question is retained — a re-hydration (remount, focus)
 * must not flash the card back to "not in plan".
 */
export function retainItemForQuestion(
  previous: HydratedStudyItem | null,
  questionId: string,
): HydratedStudyItem | null {
  if (!previous) return null;
  return previous.questionId === questionId ? previous : null;
}

/**
 * Whether a completed mutation may be written onto the currently-held state.
 *
 * The class feed keeps one hook alive while the active question changes, so a
 * callable issued for question A can resolve while question B is on screen.
 * The result is DROPPED rather than misattributed — the server already
 * recorded it, so hydrating A again shows the truth.
 */
export function shouldApplyOutcome(params: {
  targetQuestionId: string | null;
  currentQuestionId: string | null;
}): boolean {
  return (
    typeof params.targetQuestionId === "string" &&
    params.targetQuestionId.length > 0 &&
    params.targetQuestionId === params.currentQuestionId
  );
}
