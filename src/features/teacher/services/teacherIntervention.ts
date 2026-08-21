import { GRADE_LEVELS } from "@features/questions/data/questionTaxonomy";

// Phase 43 — turns a diagnosis the teacher is already looking at into the
// evidence an EXISTING composer needs. Pure, Firebase/React-free.
//
// This adds no action architecture, no route and no engine: every value it
// produces is a parameter that CreateAssignmentScreen and
// QuestionMetadataModal already accept today (initialSubject / initialTopic
// / initialGradeLevel / initialTargetStudentIds). What was missing was the
// caller supplying them.
//
// THE RULE THIS FILE EXISTS TO ENFORCE
//
// An omitted parameter is safe: the composer falls back to its own default
// and the teacher picks. A WRONG parameter is not — gradeLevel is a real
// selection input (smartAssignmentSelection.ts's baseMatchScore awards +1
// for a grade match), so a confidently-wrong grade silently changes which
// questions get selected. Everything below therefore returns null rather
// than guessing, and the callers omit the param when it is null.

// One topic a student is persistently struggling in, carrying exactly what
// an intervention needs and nothing more.
export interface InterventionTopic {
  subject: string;
  topic: string;
  // null when the questions behind this topic do not agree on one grade, or
  // when none of them has a usable grade at all. Never a default.
  gradeLevel: string | null;
  // Real struggled-outcome events (Phase 41 counters), for honest copy.
  struggledAttemptCount: number;
}

function isKnownGrade(value: string | null | undefined): value is string {
  return typeof value === "string" && (GRADE_LEVELS as readonly string[]).includes(value);
}

// The single grade a set of questions agrees on, or null.
//
// Unknown/blank grades are SKIPPED rather than treated as conflicting: an
// absent value is a lack of evidence, not evidence of a different grade —
// the same "absent is not zero" principle Phase 41's counters follow. Two
// DIFFERENT known grades, on the other hand, are a genuine conflict and
// resolve to null, because picking either would be a guess.
//
// A value outside the app's own taxonomy is treated as unknown: passing it
// on would be rejected by the composer anyway (it validates against
// GRADE_LEVELS and silently falls back to the first entry, "5"), which is
// exactly the failure this function exists to prevent.
export function resolveEvidenceGrade(
  gradeLevels: readonly (string | null | undefined)[],
): string | null {
  const known = new Set<string>();
  for (const value of gradeLevels) {
    if (isKnownGrade(value)) known.add(value);
  }
  if (known.size !== 1) return null;
  return [...known][0] ?? null;
}

// Which single topic a student-level intervention should be about.
//
// Highest real struggle-event count first, then subject/topic alphabetically
// so a tie always resolves the same way call after call — the same
// deterministic-tiebreak convention learningInsights.ts and
// dailyPracticePlan.ts already use.
//
// Returns null when there is nothing to intervene on. That is the gate: the
// caller renders no action at all rather than an action with no target.
export function resolveStudentInterventionTopic(
  topics: readonly InterventionTopic[],
): InterventionTopic | null {
  if (topics.length === 0) return null;
  return [...topics].sort((a, b) => {
    if (a.struggledAttemptCount !== b.struggledAttemptCount) {
      return b.struggledAttemptCount - a.struggledAttemptCount;
    }
    const subjectDelta = a.subject.localeCompare(b.subject, "tr");
    if (subjectDelta !== 0) return subjectDelta;
    return a.topic.localeCompare(b.topic, "tr");
  })[0] ?? null;
}

// The minimal shape topic targeting needs from a class roster card — kept
// structural so this file never imports the teacher snapshot type (which
// would be a cycle: the snapshot imports InterventionTopic from here).
export interface InterventionCandidate {
  studentUid: string;
  persistentStruggleTopics: readonly InterventionTopic[];
}

// Which students a TOPIC-level intervention should target.
//
// Only students with a persistent struggle IN THAT TOPIC. Deliberately
// narrower than the screen's existing "affected students" list, which uses
// `struggledCount > 0` (any question currently in a struggled state):
// targeting a one-off slip or a student who has already recovered is the
// over-intervention this phase is meant to prevent, and a legacy student
// with no counters can never appear here at all.
//
// Returns [] when nobody qualifies — the caller must then NOT offer a
// targeted intervention rather than silently falling back to the whole class.
export function resolveTopicInterventionTargets(
  candidates: readonly InterventionCandidate[],
  subject: string,
  topic: string,
): string[] {
  const targets: string[] = [];
  for (const candidate of candidates) {
    const matches = candidate.persistentStruggleTopics.some(
      (entry) => entry.subject === subject && entry.topic === topic,
    );
    if (matches) targets.push(candidate.studentUid);
  }
  // Roster order is already deterministic (useClassPerformance sorts its
  // cards); sorting by uid on top of that guarantees the SAME assignment
  // snapshot for the same class state regardless of how the caller ordered
  // its list.
  return targets.sort((a, b) => a.localeCompare(b));
}

// Phase 43 §8 — the smallest safe duplicate guard.
//
// Whether one of the class's RECENT assignments for this topic already
// covers every student a new intervention would target. Deliberately
// informational: it does not block, because a teacher may legitimately
// assign the same topic twice — it exists so the dashboard can say so
// instead of quietly producing a second identical assignment.
//
// Takes an already-filtered, already-bounded list: the caller passes
// Phase 31's own selectRecentTopicAssignments output (same-topic,
// non-draft, most recent first, capped at MAX_HISTORY_ASSIGNMENTS), so
// this adds no query, no ordering rule and no second notion of "recent".
//
// Returns false for an empty target list — there is nothing to duplicate
// when the intervention has no targets in the first place.
export function hasRecentTopicIntervention(
  recentTopicAssignments: readonly { targetStudentIds: readonly string[] }[],
  targetStudentIds: readonly string[],
): boolean {
  if (targetStudentIds.length === 0) return false;
  return recentTopicAssignments.some((assignment) => {
    const covered = new Set(assignment.targetStudentIds);
    return targetStudentIds.every((uid) => covered.has(uid));
  });
}
