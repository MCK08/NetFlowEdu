import { Assignment } from "../domain/assignmentTypes";
import { AssignmentProgressSummary } from "./assignmentProgress";
import { isPastDue } from "./assignmentDueDate";
import { assignmentDueLabel } from "./assignmentUrgency";

// Phase 130 — what a student is told about the assignment they are solving.
//
// Pure, like every other presentation mapping in this feature: no Firebase, no
// React, and every line is a field the assignment document (or the student's
// own submission) actually holds. Nothing here is a score, a percentage or a
// judgement of the student's answers — an assignment question is complete
// when ANY outcome was recorded for it (assignmentProgress.ts), so "tamamlandı"
// is the only honest word for it, never "çözüldü".

export const ASSIGNMENT_INSTRUCTION_TITLE = "Öğretmenin Talimatı";
export const ASSIGNMENT_START_LABEL = "Başla";
export const ASSIGNMENT_COMPLETE_TITLE = "Çalışma Tamamlandı";
export const RETURN_TO_STUDY_LABEL = "Çalış'a Dön";
export const ASSIGNMENT_INFO_LABEL = "Çalışma bilgileri";
export const ASSIGNMENT_EMPTY_TITLE = "Bu çalışmada artık geçerli soru yok";

export interface AssignmentSessionIdentity {
  title: string;
  /** "Matematik · Denklemler" — null when both are empty on an older document. */
  subjectLine: string | null;
  /** "10. sınıf · Demo Sınıfı" — the class name only once it has loaded. */
  contextLine: string | null;
  /** The canonical student deadline label (assignmentDueLabel), null without a deadline. */
  dueLabel: string | null;
  isPastDue: boolean;
  /** The teacher's description, trimmed; null when there is nothing to show. */
  instruction: string | null;
}

/** Joins the parts that exist; an empty field never leaves a stray separator. */
function joinPresent(parts: readonly (string | null | undefined)[]): string | null {
  const present = parts.map((part) => part?.trim() ?? "").filter((part) => part.length > 0);
  return present.length > 0 ? present.join(" · ") : null;
}

export function buildAssignmentSessionIdentity(params: {
  assignment: Pick<Assignment, "title" | "subject" | "topic" | "gradeLevel" | "description" | "dueAt">;
  className: string | null;
  now: number;
}): AssignmentSessionIdentity {
  const { assignment } = params;
  const grade = assignment.gradeLevel?.trim();
  const instruction = assignment.description?.trim() ?? "";
  return {
    title: assignment.title,
    subjectLine: joinPresent([assignment.subject, assignment.topic]),
    contextLine: joinPresent([grade ? `${grade}. sınıf` : null, params.className]),
    // The SAME label the "Atanan Çalışmalar" row the student just tapped
    // shows, so the two can never disagree about one deadline.
    dueLabel: assignmentDueLabel(assignment.dueAt, params.now),
    isPastDue: isPastDue(assignment.dueAt, params.now),
    instruction: instruction.length > 0 ? instruction : null,
  };
}

/** "5 soru" before anything is done; afterwards the Çalış row's own phrasing. */
export function assignmentSessionProgressLabel(progress: AssignmentProgressSummary): string {
  if (progress.completedCount === 0) return `${progress.targetCount} soru`;
  return `${progress.completedCount} / ${progress.targetCount} tamamlandı`;
}

/** What VoiceOver reads for the header's "2 / 5" — a fraction is not a sentence. */
export function assignmentProgressAccessibilityLabel(progress: AssignmentProgressSummary): string {
  return `${progress.targetCount} sorudan ${progress.completedCount} tanesi tamamlandı`;
}

/** The completion screen's count — the whole assignment's, from the submission, not this visit's. */
export function assignmentCompletionLine(progress: AssignmentProgressSummary): string {
  return `${progress.completedCount} / ${progress.targetCount} soru tamamlandı`;
}

/**
 * Whether the session opens on the assignment's introduction rather than on a
 * question. Only an assignment with nothing recorded yet does: a student
 * coming back to one they have started lands straight on their next
 * unanswered question, exactly as before, and is never sent back through it.
 */
export function shouldOpenOnAssignmentIntro(progress: Pick<AssignmentProgressSummary, "completedCount">): boolean {
  return progress.completedCount === 0;
}
