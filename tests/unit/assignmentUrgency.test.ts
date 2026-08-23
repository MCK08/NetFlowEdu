import { Assignment, AssignmentSubmission } from "../../src/features/assignments/domain/assignmentTypes";
import { StudentAssignmentCard } from "../../src/features/assignments/hooks/useStudentAssignments";
import { resolveStudentAssignmentStatus } from "../../src/features/assignments/services/assignmentProgress";
import {
  assignmentDueLabel,
  daysUntilDue,
  IMMINENT_ASSIGNMENT_DAYS,
  localDayDiff,
  pickNextAssignment,
  resolveAssignmentUrgency,
} from "../../src/features/assignments/services/assignmentUrgency";

// Phase 39 — the Study Hub has to compare an assignment against a due
// review to answer "what should I do right now". These tests lock in the
// ranking that comparison depends on, and the one honest deadline label
// both the recommendation card and "Atanan Çalışmalar" now share.
//
// A fixed local noon so a test can add/subtract hours without accidentally
// crossing a local midnight and changing the calendar-day answer.
const NOW = new Date(2026, 7, 17, 12, 0, 0, 0).getTime();
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function endOfLocalDayFrom(now: number, offsetDays: number): number {
  const date = new Date(now);
  date.setDate(date.getDate() + offsetDays);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}

function assignment(overrides: Partial<Assignment> = {}): Assignment {
  return {
    id: "a1",
    classId: "c1",
    organizationId: "org1",
    teacherId: "t1",
    title: "Türev Tekrarı",
    description: null,
    subject: "Matematik",
    topic: "Türev",
    gradeLevel: "12",
    targetStudentIds: ["s1"],
    questionIds: ["q1", "q2", "q3"],
    targetCount: 3,
    dueAt: null,
    status: "published",
    createdAt: NOW - 7 * DAY_MS,
    updatedAt: NOW - 7 * DAY_MS,
    interventionOf: null,
    ...overrides,
  };
}

function submission(completedCount: number): AssignmentSubmission {
  return {
    studentId: "s1",
    completedQuestionIds: ["q1", "q2", "q3"].slice(0, completedCount),
    completedCount,
    startedAt: completedCount > 0 ? NOW - DAY_MS : null,
    lastCompletedAt: completedCount > 0 ? NOW - DAY_MS : null,
    completedAt: null,
    questionOutcomes: {},
  };
}

// Real cards, with the status resolved by the SAME function
// useStudentAssignments uses — never a hand-written status that could
// disagree with what the app would actually compute.
function card(
  assignmentOverrides: Partial<Assignment> = {},
  completedCount = 0,
  now = NOW,
): StudentAssignmentCard {
  const a = assignment(assignmentOverrides);
  const s = completedCount > 0 ? submission(completedCount) : null;
  return {
    assignment: a,
    submission: s,
    status: resolveStudentAssignmentStatus({
      submission: s,
      targetCount: a.targetCount,
      dueAt: a.dueAt,
      now,
    }),
  };
}

describe("localDayDiff", () => {
  it("counts whole local calendar days, not elapsed milliseconds", () => {
    // 12:00 today -> 23:59 today is the SAME calendar day, even though it
    // is over half a day of elapsed time.
    expect(localDayDiff(NOW, endOfLocalDayFrom(NOW, 0))).toBe(0);
    expect(localDayDiff(NOW, endOfLocalDayFrom(NOW, 1))).toBe(1);
    expect(localDayDiff(NOW, endOfLocalDayFrom(NOW, 5))).toBe(5);
  });

  it("goes negative for a day already past", () => {
    expect(localDayDiff(NOW, endOfLocalDayFrom(NOW, -1))).toBe(-1);
  });

  it("is 0 for two instants inside the same local day, in either direction", () => {
    expect(localDayDiff(NOW, NOW + 6 * HOUR_MS)).toBe(0);
    expect(localDayDiff(NOW, NOW - 6 * HOUR_MS)).toBe(0);
  });

  it("returns 0 rather than NaN for a non-finite input", () => {
    expect(localDayDiff(Number.NaN, NOW)).toBe(0);
    expect(localDayDiff(NOW, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("daysUntilDue", () => {
  it("is null when the assignment has no deadline at all", () => {
    expect(daysUntilDue(null, NOW)).toBeNull();
  });

  it("is 0 on the deadline's own day", () => {
    expect(daysUntilDue(endOfLocalDayFrom(NOW, 0), NOW)).toBe(0);
  });
});

describe("assignmentDueLabel", () => {
  it("is null with no deadline — the card shows no deadline text at all", () => {
    expect(assignmentDueLabel(null, NOW)).toBeNull();
  });

  // The bug this shared helper removes: the previous per-component copy
  // computed ceil((dueAt - now) / DAY_MS), so a deadline at 23:59 TODAY read
  // at 12:00 gave ceil(0.49) === 1 and rendered "Yarın" — wrong on the one
  // day the label matters most, and "Bugün" was unreachable in practice.
  it("says Bugün for a deadline landing later the same day", () => {
    expect(assignmentDueLabel(endOfLocalDayFrom(NOW, 0), NOW)).toBe("Son tarih: Bugün");
  });

  it("says Yarın only for the next calendar day", () => {
    expect(assignmentDueLabel(endOfLocalDayFrom(NOW, 1), NOW)).toBe("Son tarih: Yarın");
  });

  it("counts real remaining days beyond tomorrow", () => {
    expect(assignmentDueLabel(endOfLocalDayFrom(NOW, 4), NOW)).toBe("Son tarih: 4 gün sonra");
  });

  it("says Süresi geçti once the deadline instant has actually passed", () => {
    expect(assignmentDueLabel(endOfLocalDayFrom(NOW, -1), NOW)).toBe("Süresi geçti");
  });

  it("is not yet past at the exact deadline instant — same boundary as isPastDue", () => {
    const due = endOfLocalDayFrom(NOW, 0);
    expect(assignmentDueLabel(due, due)).toBe("Son tarih: Bugün");
    expect(assignmentDueLabel(due, due + 1)).toBe("Süresi geçti");
  });
});

describe("resolveAssignmentUrgency", () => {
  it("treats today and tomorrow as imminent — the window the deadline copy already singles out", () => {
    expect(resolveAssignmentUrgency(endOfLocalDayFrom(NOW, 0), NOW)).toBe("imminent");
    expect(resolveAssignmentUrgency(endOfLocalDayFrom(NOW, IMMINENT_ASSIGNMENT_DAYS), NOW)).toBe(
      "imminent",
    );
  });

  it("is only 'open' the day after the imminent window closes", () => {
    expect(resolveAssignmentUrgency(endOfLocalDayFrom(NOW, IMMINENT_ASSIGNMENT_DAYS + 1), NOW)).toBe(
      "open",
    );
  });

  it("is 'open' with no deadline — nothing can be lost by waiting", () => {
    expect(resolveAssignmentUrgency(null, NOW)).toBe("open");
  });

  it("is 'past_due' once the deadline has passed", () => {
    expect(resolveAssignmentUrgency(endOfLocalDayFrom(NOW, -1), NOW)).toBe("past_due");
  });
});

describe("pickNextAssignment", () => {
  it("returns null when the student has no assignments", () => {
    expect(pickNextAssignment([], NOW)).toBeNull();
  });

  it("returns null when every assignment is already completed", () => {
    const done = card({ id: "done" }, 3);
    expect(done.status).toBe("completed");
    expect(pickNextAssignment([done], NOW)).toBeNull();
  });

  it("skips an assignment with no remaining questions — there is nothing to open", () => {
    expect(pickNextAssignment([card({ id: "empty", targetCount: 0, questionIds: [] })], NOW)).toBeNull();
  });

  it("prefers an imminent deadline over an open one", () => {
    const open = card({ id: "open", dueAt: endOfLocalDayFrom(NOW, 9) });
    const imminent = card({ id: "imminent", dueAt: endOfLocalDayFrom(NOW, 1) });
    expect(pickNextAssignment([open, imminent], NOW)?.card.assignment.id).toBe("imminent");
  });

  // The existing judgment in useStudentAssignments' sortForStudent, kept
  // rather than overridden: a still-open assignment outranks one whose
  // deadline the student can no longer meet.
  it("ranks a past-due assignment BELOW a still-open one", () => {
    const pastDue = card({ id: "late", dueAt: endOfLocalDayFrom(NOW, -3) });
    const open = card({ id: "open", dueAt: null });
    expect(pastDue.status).toBe("past_due");
    expect(pickNextAssignment([pastDue, open], NOW)?.card.assignment.id).toBe("open");
  });

  it("still returns a past-due assignment when it is the only one left", () => {
    const pastDue = card({ id: "late", dueAt: endOfLocalDayFrom(NOW, -3) });
    const picked = pickNextAssignment([pastDue], NOW);
    expect(picked?.card.assignment.id).toBe("late");
    expect(picked?.urgency).toBe("past_due");
  });

  it("prefers finishing something already started over starting a new one", () => {
    const fresh = card({ id: "fresh", dueAt: null }, 0);
    const started = card({ id: "started", dueAt: null }, 2);
    expect(pickNextAssignment([fresh, started], NOW)?.card.assignment.id).toBe("started");
  });

  it("prefers the nearest real deadline when urgency and progress tie", () => {
    const far = card({ id: "far", dueAt: endOfLocalDayFrom(NOW, 20) });
    const near = card({ id: "near", dueAt: endOfLocalDayFrom(NOW, 6) });
    expect(pickNextAssignment([far, near], NOW)?.card.assignment.id).toBe("near");
  });

  it("never lets a deadline-free assignment jump ahead of one that has a date", () => {
    const dated = card({ id: "dated", dueAt: endOfLocalDayFrom(NOW, 20) });
    const undated = card({ id: "undated", dueAt: null });
    expect(pickNextAssignment([undated, dated], NOW)?.card.assignment.id).toBe("dated");
  });

  it("breaks a full tie by newest first, then by id — deterministically", () => {
    const older = card({ id: "b", dueAt: null, createdAt: NOW - 9 * DAY_MS });
    const newer = card({ id: "a", dueAt: null, createdAt: NOW - 2 * DAY_MS });
    expect(pickNextAssignment([older, newer], NOW)?.card.assignment.id).toBe("a");

    const sameTime = [
      card({ id: "zebra", dueAt: null, createdAt: NOW }),
      card({ id: "alpha", dueAt: null, createdAt: NOW }),
    ];
    expect(pickNextAssignment(sameTime, NOW)?.card.assignment.id).toBe("alpha");
  });

  it("is order-independent: shuffling the input never changes the answer", () => {
    const cards = [
      card({ id: "open", dueAt: endOfLocalDayFrom(NOW, 8) }),
      card({ id: "late", dueAt: endOfLocalDayFrom(NOW, -2) }),
      card({ id: "imminent", dueAt: endOfLocalDayFrom(NOW, 0) }),
      card({ id: "done" }, 3),
    ];
    expect(pickNextAssignment(cards, NOW)?.card.assignment.id).toBe("imminent");
    expect(pickNextAssignment([...cards].reverse(), NOW)?.card.assignment.id).toBe("imminent");
  });

  it("reports real remaining work and real started-ness, not the display status", () => {
    // past_due masks in_progress in `status`, so isStarted must come from
    // the submission's own completedCount.
    const late = card({ id: "late", dueAt: endOfLocalDayFrom(NOW, -1) }, 1);
    const picked = pickNextAssignment([late], NOW);
    expect(late.status).toBe("past_due");
    expect(picked?.isStarted).toBe(true);
    expect(picked?.remainingCount).toBe(2);
  });

  it("does not mutate the array it is given", () => {
    const cards = [
      card({ id: "b", dueAt: endOfLocalDayFrom(NOW, 8) }),
      card({ id: "a", dueAt: endOfLocalDayFrom(NOW, 0) }),
    ];
    const idsBefore = cards.map((c) => c.assignment.id);
    pickNextAssignment(cards, NOW);
    expect(cards.map((c) => c.assignment.id)).toEqual(idsBefore);
  });
});
