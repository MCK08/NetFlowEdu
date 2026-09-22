import type { Assignment } from "@features/assignments/domain/assignmentTypes";
import type { ClassMember } from "@/types/class";
import type { Question } from "@/types/question";

// Phase 110 — the safe class social layer, as pure data.
//
// WHAT THIS IS NOT
//
// Not a leaderboard, not a ranking, not a popularity score. Nothing here orders
// students by anything they did. Classmates are listed by NAME; the activity
// list is ordered by TIME; the weekly figure is the CLASS's, never a person's.
//
// ONLY WHAT IS REAL AND ALREADY SHARED
//
// Every event is derived from a record the student can already read, inside
// their own class:
//   * a class question a member shared (questions, visibility "class");
//   * an assignment the teacher posted TO this student (assignments rules only
//     return ones the caller is targeted by) — never an intervention, which is
//     personal support that lives in Çalış, not class news;
//   * a classmate joining (the member row's joinedAt).
// Assignment COMPLETIONS are deliberately absent: submissions are readable only
// by their student and the teacher, so "Ece tamamladı" would publish private
// progress. There is no event the product cannot back with a record.

export type ClassActivityKind = "question_shared" | "assignment_posted" | "member_joined";

export interface ClassActivityEvent {
  /** Stable across renders: kind + the underlying record id. */
  id: string;
  kind: ClassActivityKind;
  occurredAt: number;
  /** A classmate's display name, or null when the event has no person. */
  actorName: string | null;
  /** The record the event opens, when it opens one. */
  questionId: string | null;
  assignmentId: string | null;
  assignmentTitle: string | null;
  /** True only for a classmate's shared question — the one kudos target. */
  canCongratulate: boolean;
}

export const CLASS_ACTIVITY_LIMIT = 6;

const UNKNOWN_CLASSMATE = "Bir sınıf arkadaşın";

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function memberName(member: ClassMember | undefined): string | null {
  const name = member?.displayName?.trim();
  return name ? name : null;
}

export interface BuildClassActivityInput {
  classId: string;
  currentUid: string | null;
  members: readonly ClassMember[];
  questions: readonly Question[];
  assignments: readonly Assignment[];
  limit?: number;
}

/** The class assignments a student is shown, by the only rule this feature
 *  has ever applied to them: this class, actually published, not a Phase 44
 *  teacher intervention (which is addressed to one student and is not class
 *  news), with a real creation time and a real title.
 *
 *  Phase 118 — extracted so the list of a class's assignments and the
 *  activity line announcing one can never disagree about which assignments
 *  exist. Newest first, the same order useClassAssignments already sorts a
 *  class's assignments into; the activity feed re-sorts by time afterwards. */
export function selectClassAssignments(
  assignments: readonly Assignment[],
  classId: string,
): Assignment[] {
  return assignments
    .filter(
      (assignment) =>
        assignment.classId === classId &&
        assignment.status === "published" &&
        !assignment.interventionOf &&
        isFiniteTimestamp(assignment.createdAt) &&
        Boolean(assignment.title?.trim()),
    )
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function buildClassActivity(input: BuildClassActivityInput): ClassActivityEvent[] {
  const membersById = new Map(input.members.map((member) => [member.uid, member]));
  const events: ClassActivityEvent[] = [];

  for (const question of input.questions) {
    // Anything not a class question of THIS class is not this class's news.
    if (question.visibility !== "class" || question.classId !== input.classId) continue;
    if (!isFiniteTimestamp(question.createdAt)) continue;
    const owner = membersById.get(question.ownerId);
    const isSelf = question.ownerId === input.currentUid;
    events.push({
      id: `question_shared:${question.id}`,
      kind: "question_shared",
      occurredAt: question.createdAt,
      actorName: isSelf ? null : memberName(owner) ?? UNKNOWN_CLASSMATE,
      questionId: question.id,
      assignmentId: null,
      assignmentTitle: null,
      // Only a CURRENT student classmate's question — the same test the server
      // applies. A teacher's question, a departed student's, or one's own is
      // shown but never offered for congratulation.
      canCongratulate: !isSelf && owner?.role === "student",
    });
  }

  for (const assignment of selectClassAssignments(input.assignments, input.classId)) {
    events.push({
      id: `assignment_posted:${assignment.id}`,
      kind: "assignment_posted",
      occurredAt: assignment.createdAt,
      actorName: null,
      questionId: null,
      assignmentId: assignment.id,
      assignmentTitle: assignment.title.trim(),
      canCongratulate: false,
    });
  }

  for (const member of input.members) {
    if (member.role !== "student" || member.uid === input.currentUid) continue;
    if (!isFiniteTimestamp(member.joinedAt)) continue;
    events.push({
      id: `member_joined:${member.uid}`,
      kind: "member_joined",
      occurredAt: member.joinedAt,
      actorName: memberName(member) ?? UNKNOWN_CLASSMATE,
      questionId: null,
      assignmentId: null,
      assignmentTitle: null,
      canCongratulate: false,
    });
  }

  return events
    .sort((a, b) => b.occurredAt - a.occurredAt || a.id.localeCompare(b.id))
    .slice(0, input.limit ?? CLASS_ACTIVITY_LIMIT);
}

/** One calm sentence per event. A name stands on its own — no Turkish case
 *  suffix is ever bolted onto it. */
export function classActivitySentence(event: ClassActivityEvent): string {
  switch (event.kind) {
    case "question_shared":
      return event.actorName ? `${event.actorName} sınıfta bir soru paylaştı.` : "Sınıfta bir soru paylaştın.";
    case "assignment_posted":
      return `Yeni çalışma atandı: ${event.assignmentTitle ?? ""}`.trim();
    case "member_joined":
      return `${event.actorName ?? UNKNOWN_CLASSMATE} sınıfa katıldı.`;
    default: {
      const exhaustive: never = event.kind;
      throw new Error(`Unhandled activity kind: ${String(exhaustive)}`);
    }
  }
}

// ─── Classmates ────────────────────────────────────────────────────────────

export interface Classmate {
  uid: string;
  name: string;
  username: string | null;
  photoURL: string | null;
  role: ClassMember["role"];
  joinedAt: number;
  isSelf: boolean;
}

/** The roster in a NEUTRAL order: the teacher first, then everyone
 *  alphabetically. Never by activity, join order or anything that reads as a
 *  standing — an alphabet ranks no one. */
export function buildClassmates(members: readonly ClassMember[], currentUid: string | null): Classmate[] {
  return members
    .map((member) => ({
      uid: member.uid,
      name: memberName(member) ?? "İsimsiz üye",
      username: member.username?.trim() ? member.username.trim() : null,
      photoURL: member.photoURL ?? null,
      role: member.role,
      joinedAt: member.joinedAt,
      isSelf: member.uid === currentUid,
    }))
    .sort((a, b) => {
      if (a.role !== b.role) return a.role === "teacher" ? -1 : 1;
      return a.name.localeCompare(b.name, "tr") || a.uid.localeCompare(b.uid);
    });
}

export function otherStudentCount(classmates: readonly Classmate[]): number {
  return classmates.filter((mate) => mate.role === "student" && !mate.isSelf).length;
}

export const CLASS_ROLE_LABEL: Readonly<Record<ClassMember["role"], string>> = {
  teacher: "Öğretmen",
  student: "Öğrenci",
};

// ─── Weekly class pulse ────────────────────────────────────────────────────

// MUST match functions/src/classes/classPulse.ts (a test pins them together):
// the client asks for the SAME document the server writes.
export const CLASS_PULSE_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function classPulseWeekKey(timestamp: number): string {
  const local = new Date(timestamp + CLASS_PULSE_UTC_OFFSET_MS);
  const daysSinceMonday = (local.getUTCDay() + 6) % 7;
  const localMidnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const monday = new Date(localMidnight - daysSinceMonday * DAY_MS);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`;
}

export interface ClassPulse {
  outcomeCount: number;
  solvedCount: number;
  participantCount: number;
}

// Below this many participants the week is not shown at all. In a class where
// only one or two students studied, "the class solved 14" is really one
// person's number — and an aggregate that can be read back to an individual is
// not an aggregate.
export const MIN_PULSE_PARTICIPANTS = 3;

export function parseClassPulse(raw: unknown): ClassPulse | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const count = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  return {
    outcomeCount: count(data.outcomeCount),
    solvedCount: count(data.solvedCount),
    participantCount: count(data.participantCount),
  };
}

/** The week in collective sentences, or null when there is not enough to say
 *  honestly — the caller then shows the calm empty line instead. */
export function classPulseFacts(pulse: ClassPulse | null): string[] | null {
  if (!pulse || pulse.participantCount < MIN_PULSE_PARTICIPANTS) return null;
  const facts = [`${pulse.participantCount} öğrenci sınıf sorularıyla çalıştı`];
  if (pulse.solvedCount > 0) facts.push(`Sınıf sorularında ${pulse.solvedCount} çözüm kaydedildi`);
  return facts;
}

export const CLASS_PULSE_EMPTY = "Bu hafta için henüz yeterli sınıf etkinliği yok.";
