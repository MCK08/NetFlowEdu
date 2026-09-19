import type { Assignment } from "@features/assignments/domain/assignmentTypes";
import type { ClassRoom } from "@/types/class";

import type { TeacherActionCenterItem } from "./teacherActionCenter";

// Phase 111 — "Bugün", the teacher's home, as pure presentation over data the
// product already computes.
//
// NOTHING HERE DECIDES WHO NEEDS ATTENTION
//
// That is the Action Center's job (Phase 73/101), built from Phase 42/43/47:
// escalations, follow-ups, interventions, students — in its own fixed order.
// This module only counts what that list already says, picks which class to
// show, and phrases one sentence. No score, no urgency ranking of its own, no
// new classifier.
//
// ONE CLASS AT A TIME, DELIBERATELY
//
// A class's attention list needs one study-item read per student in it. Doing
// that for every class on every open would multiply the reads by the class
// count — the fan-out TeacherFeedScreen already documents as forbidden. So
// "Bugün" shows one class's list and lets the teacher switch classes; a true
// cross-class summary would need a server-maintained per-class aggregate.

/** Classes a teacher can act in today: not archived, newest first. */
export function activeTeacherClasses(classes: readonly ClassRoom[]): ClassRoom[] {
  return classes
    .filter((classRoom) => classRoom.status !== "archived")
    .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
}

/** Keeps the teacher's current choice while it is still valid; otherwise the
 *  newest active class; otherwise none. */
export function resolveSelectedClassId(active: readonly ClassRoom[], current: string | null): string | null {
  if (current && active.some((classRoom) => classRoom.id === current)) return current;
  return active[0]?.id ?? null;
}

export interface TodaySummary {
  /** Distinct students named by the canonical action list. */
  studentCount: number;
  /** Topic-level actions (a hotspot needing an intervention). */
  topicCount: number;
  sentence: string;
}

export const TODAY_NOTHING_PENDING = "Şu anda takip bekleyen bir öğrenci yok.";

/** One honest sentence, counted from the Action Center's own items. */
export function buildTodaySummary(items: readonly TeacherActionCenterItem[]): TodaySummary {
  const students = new Set<string>();
  let topicCount = 0;
  for (const item of items) {
    if (item.studentUid) students.add(item.studentUid);
    else topicCount += 1;
  }
  const studentCount = students.size;
  if (studentCount === 0 && topicCount === 0) {
    return { studentCount, topicCount, sentence: TODAY_NOTHING_PENDING };
  }
  const parts: string[] = [];
  if (studentCount > 0) parts.push(`${studentCount} öğrenci dikkatini bekliyor`);
  if (topicCount > 0) parts.push(`${topicCount} konu için müdahale öneriliyor`);
  return { studentCount, topicCount, sentence: `Bugün ${parts.join(", ")}.` };
}

export const MAX_UPCOMING_ASSIGNMENTS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface UpcomingAssignment {
  id: string;
  title: string;
  dueLabel: string;
}

function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

// By CALENDAR day, not elapsed time: work due at 23:50 tonight is due "bugün"
// even at 00:05, and work due in one minute is never "yarın". (Rounding the
// millisecond difference up is what called it "yarın".)
function dueLabel(dueAt: number, now: number): string {
  const days = Math.round((startOfLocalDay(dueAt) - startOfLocalDay(now)) / DAY_MS);
  if (days <= 0) return "bugün teslim";
  if (days === 1) return "yarın teslim";
  return `${days} gün sonra teslim`;
}

/** Published work in this class that is still due, soonest first. Only real
 *  due dates; an assignment without one is not "upcoming", it is just open. */
export function upcomingAssignments(
  assignments: readonly Assignment[],
  now: number,
  limit = MAX_UPCOMING_ASSIGNMENTS,
): UpcomingAssignment[] {
  return assignments
    .filter(
      (assignment) =>
        assignment.status === "published" &&
        typeof assignment.dueAt === "number" &&
        Number.isFinite(assignment.dueAt) &&
        assignment.dueAt >= now - DAY_MS / 2,
    )
    .sort((a, b) => (a.dueAt as number) - (b.dueAt as number) || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map((assignment) => ({
      id: assignment.id,
      title: assignment.title.trim() || "Adsız çalışma",
      dueLabel: dueLabel(assignment.dueAt as number, now),
    }));
}

/** "3 yanıt inceleme bekliyor" — or "20+ …" when the first page is full. Null
 *  when nothing is waiting, so no empty row is ever drawn. */
export function reviewPendingLabel(
  count: number,
  hasMore: boolean,
  noun: "yanıt" | "yorum",
): string | null {
  if (count <= 0) return null;
  return `${count}${hasMore ? "+" : ""} ${noun} inceleme bekliyor`;
}
