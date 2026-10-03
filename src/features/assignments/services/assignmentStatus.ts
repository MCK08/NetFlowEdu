import { Assignment, AssignmentStatus } from "../domain/assignmentTypes";
import { isPastDue } from "./assignmentDueDate";

// "expired"/"past_due" is deliberately NOT a stored status (§10) — it's
// derived here, purely from the stored `status` + `dueAt` + the current
// clock. A published assignment whose deadline has passed stays
// `status: "published"` in Firestore forever; only the DISPLAY reads it as
// past due. This is what guarantees a passed deadline can never delete or
// hide a student's progress.
export type AssignmentDisplayStatus = "draft" | "active" | "past_due" | "archived";

export function resolveAssignmentDisplayStatus(
  status: AssignmentStatus,
  dueAt: number | null,
  now: number,
): AssignmentDisplayStatus {
  if (status === "draft") return "draft";
  if (status === "archived") return "archived";
  return isPastDue(dueAt, now) ? "past_due" : "active";
}

// Phase 128 — the WORD for a display status, lifted out of Sınıf Performansı
// (Phase 104 B6 wrote it there) now that the assignment's own detail screen
// names its status too. One vocabulary, so the list a teacher taps and the
// screen it opens can never call the same assignment two different things.
// Same words as before; nothing here decides a status, it only names one.
export function assignmentStatusLabel(status: AssignmentDisplayStatus): string {
  switch (status) {
    case "draft":
      return "Taslak";
    case "archived":
      return "Arşivlendi";
    case "past_due":
      return "Süresi geçti";
    case "active":
      return "Aktif";
  }
}

// Phase 129 — the ONE definition of "this assignment has been sent".
//
// A draft is the teacher's own work in progress — the composer promises
// "öğrencilere gönderilmez" — and an archived assignment has been withdrawn.
// Only a published one has reached its students. Every student surface that
// lists, plans or opens assigned work asks this question through this
// function, so Çalış, Akış, the daily plan, the atlas, the class page and the
// solving session can never again disagree about whether a draft exists.
//
// This is product behaviour, not a security boundary: firestore.rules still
// let a targeted student read a draft. Enforcing "published only" there is a
// separate, explicitly-scoped hardening task (rules + query + index).
export function isAssignmentDeliveredToStudents(assignment: Pick<Assignment, "status">): boolean {
  return assignment.status === "published";
}

// Phase 129 — a class's drafts, newest first, for the teacher to find again.
// The work list (upcomingAssignments) is published-only on purpose — it is
// what is due — so without this a draft was unreachable once the composer
// closed.
export function selectDraftAssignments(assignments: readonly Assignment[]): Assignment[] {
  return assignments
    .filter((assignment) => assignment.status === "draft")
    .sort((a, b) => b.createdAt - a.createdAt);
}

// Phase 129 — what a student's solving session may do with the document it
// just read. Decided BEFORE any submission read, question read or progress
// write: "not_found" is permanent (no retry), "unavailable" is an assignment
// this student was never sent or that was withdrawn, and only "open" proceeds.
export type AssignmentSessionAccess = "not_found" | "unavailable" | "open";

export function resolveAssignmentSessionAccess(
  assignment: Pick<Assignment, "status"> | null,
): AssignmentSessionAccess {
  if (!assignment) return "not_found";
  return isAssignmentDeliveredToStudents(assignment) ? "open" : "unavailable";
}
