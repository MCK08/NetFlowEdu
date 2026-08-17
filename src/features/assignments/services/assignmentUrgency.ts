import { StudentAssignmentCard } from "../hooks/useStudentAssignments";
import { isPastDue } from "./assignmentDueDate";

// Pure assignment-urgency ranking. Firebase/React-free and directly
// unit-testable, like every other service in this feature.
//
// Phase 39 — the Study Hub has to compare an assignment against a due
// review to answer "what should I do now". Those were previously ranked by
// two mechanisms that knew nothing about each other (useStudentAssignments'
// sortForStudent for assignments, dailyPracticePlan's tiers for study), so
// this module isolates the ONE question the recommendation needs answered:
// which single incomplete assignment is the most pressing, and how pressing
// is it. It deliberately does NOT re-rank the "Atanan Çalışmalar" list —
// sortForStudent stays the owner of that ordering.

const DAY_MS = 24 * 60 * 60 * 1000;

// "Due today or tomorrow". Not an invented threshold: dueAt is always the
// last millisecond of a teacher-picked LOCAL calendar day (see
// assignmentDueDate.ts's endOfLocalDay), and "Bugün"/"Yarın" are already
// the two buckets the assignment card's own deadline copy singles out.
export const IMMINENT_ASSIGNMENT_DAYS = 1;

// Whole local calendar days between two instants, midnight to midnight.
// Uses setHours(0,0,0,0) on real Date objects rather than dividing raw
// epoch ms so a DST transition (a 23- or 25-hour day) can never shift the
// answer by one — the same device-local day-boundary convention
// studentPerformance.ts's localDayKey and studyWeek.ts already follow.
export function localDayDiff(from: number, to: number): number {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

// Whole local days until the deadline, or null when there is no deadline.
// 0 = the deadline lands today, 1 = tomorrow. Negative once the day itself
// has passed.
export function daysUntilDue(dueAt: number | null, now: number): number | null {
  if (dueAt === null || !Number.isFinite(dueAt)) return null;
  return localDayDiff(now, dueAt);
}

// The deadline as the student reads it. Single source of truth so the
// recommendation card and the "Atanan Çalışmalar" card can never disagree
// about the same assignment.
//
// Computed from the local calendar day, NOT from ceil(deltaMs / day):
// with the millisecond form, a deadline at 23:59 TODAY read at 10:00 gives
// ceil(0.58) === 1 and renders "Yarın", which is wrong on the one day it
// matters most.
export function assignmentDueLabel(dueAt: number | null, now: number): string | null {
  if (dueAt === null || !Number.isFinite(dueAt)) return null;
  if (isPastDue(dueAt, now)) return "Süresi geçti";
  const days = localDayDiff(now, dueAt);
  if (days <= 0) return "Son tarih: Bugün";
  if (days === 1) return "Son tarih: Yarın";
  return `Son tarih: ${days} gün sonra`;
}

// "imminent" is the only state where waiting actually costs the student
// something irreversible — a due review stays due forever, a deadline does
// not. "past_due" ranks LAST on purpose, matching the existing judgment in
// useStudentAssignments' sortForStudent: a still-open assignment outranks
// one whose deadline the student can no longer meet.
export type AssignmentUrgency = "imminent" | "open" | "past_due";

export function resolveAssignmentUrgency(
  dueAt: number | null,
  now: number,
): AssignmentUrgency {
  if (isPastDue(dueAt, now)) return "past_due";
  const days = daysUntilDue(dueAt, now);
  if (days !== null && days <= IMMINENT_ASSIGNMENT_DAYS) return "imminent";
  return "open";
}

export interface RankedAssignment {
  card: StudentAssignmentCard;
  urgency: AssignmentUrgency;
  // null when the assignment has no deadline at all.
  dueInDays: number | null;
  // Real remaining work, from the student's own submission — never an
  // estimate. 0 is impossible here: a completed assignment is excluded.
  remainingCount: number;
  // Whether the student has actually recorded progress. Read from
  // completedCount rather than `status`, because "past_due" masks
  // in_progress/not_started once a deadline passes.
  isStarted: boolean;
}

const URGENCY_RANK: Record<AssignmentUrgency, number> = {
  imminent: 0,
  open: 1,
  past_due: 2,
};

// Picks the single most pressing INCOMPLETE assignment, or null when the
// student has none. Fully deterministic: urgency, then started-before-
// unstarted (finishing something already begun beats opening a new one),
// then the nearest real deadline (an assignment with no deadline never
// jumps ahead of one that has a date), then newest first, then id — so the
// same input always yields the same recommendation, call after call.
export function pickNextAssignment(
  cards: readonly StudentAssignmentCard[],
  now: number,
): RankedAssignment | null {
  const ranked: RankedAssignment[] = [];
  for (const card of cards) {
    if (card.status === "completed") continue;
    const completedCount = card.submission?.completedCount ?? 0;
    const targetCount =
      Number.isFinite(card.assignment.targetCount) && card.assignment.targetCount > 0
        ? Math.floor(card.assignment.targetCount)
        : 0;
    const remainingCount = Math.max(0, targetCount - completedCount);
    // A zero-question assignment has nothing to continue — recommending it
    // would open a session with no work in it.
    if (remainingCount === 0) continue;
    ranked.push({
      card,
      urgency: resolveAssignmentUrgency(card.assignment.dueAt, now),
      dueInDays: daysUntilDue(card.assignment.dueAt, now),
      remainingCount,
      isStarted: completedCount > 0,
    });
  }

  if (ranked.length === 0) return null;

  ranked.sort((a, b) => {
    const urgencyDelta = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
    if (urgencyDelta !== 0) return urgencyDelta;

    if (a.isStarted !== b.isStarted) return a.isStarted ? -1 : 1;

    const aDue = a.card.assignment.dueAt;
    const bDue = b.card.assignment.dueAt;
    if (aDue !== bDue) {
      if (aDue === null) return 1;
      if (bDue === null) return -1;
      return aDue - bDue;
    }

    const createdDelta = b.card.assignment.createdAt - a.card.assignment.createdAt;
    if (createdDelta !== 0) return createdDelta;

    return a.card.assignment.id.localeCompare(b.card.assignment.id);
  });

  return ranked[0] ?? null;
}
