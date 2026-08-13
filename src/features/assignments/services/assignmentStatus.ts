import { AssignmentStatus } from "../domain/assignmentTypes";
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
