import {
  MAX_ASSIGNMENT_DESCRIPTION_LENGTH,
  MAX_ASSIGNMENT_QUESTIONS,
  MAX_ASSIGNMENT_STUDENTS,
  MAX_ASSIGNMENT_TITLE_LENGTH,
} from "../domain/assignmentTypes";

export type TargetStudentMode = "all" | "selected";

// "Tüm sınıf" resolves to a SNAPSHOT of the roster the teacher already has
// loaded (no new read — see useClassPerformance's cards), not a live query;
// "selected" is exactly whatever the teacher picked. Either way the result
// is deduped and capped — §5 deliberately keeps this teacher-driven (no
// automatic "needs_attention" targeting).
export function resolveTargetStudentIds(
  mode: TargetStudentMode,
  allClassStudentIds: readonly string[],
  selectedStudentIds: readonly string[],
): string[] {
  const source = mode === "all" ? allClassStudentIds : selectedStudentIds;
  return [...new Set(source)].slice(0, MAX_ASSIGNMENT_STUDENTS);
}

export interface AssignmentDraftInput {
  title: string;
  targetStudentIds: readonly string[];
  questionIds: readonly string[];
  description: string | null;
}

export interface AssignmentValidationResult {
  valid: boolean;
  error: string | null;
}

// Validates the ACTUAL resolved draft — questionIds here is what
// selectSmartAssignmentQuestions actually found, not what the teacher
// requested, so "fewer available than requested" surfaces as a real,
// honest validation message rather than silently publishing a
// smaller-than-expected assignment.
export function validateAssignmentDraft(input: AssignmentDraftInput): AssignmentValidationResult {
  const title = input.title.trim();
  if (title.length === 0) {
    return { valid: false, error: "Lütfen bir başlık girin." };
  }
  if (title.length > MAX_ASSIGNMENT_TITLE_LENGTH) {
    return { valid: false, error: "Başlık çok uzun." };
  }
  if (input.description !== null && input.description.length > MAX_ASSIGNMENT_DESCRIPTION_LENGTH) {
    return { valid: false, error: "Açıklama çok uzun." };
  }
  if (input.targetStudentIds.length === 0) {
    return { valid: false, error: "En az bir öğrenci seçmelisiniz." };
  }
  if (input.targetStudentIds.length > MAX_ASSIGNMENT_STUDENTS) {
    return { valid: false, error: "Çok fazla öğrenci seçildi." };
  }
  if (input.questionIds.length === 0) {
    return { valid: false, error: "Bu kriterlere uyan soru bulunamadı." };
  }
  if (input.questionIds.length > MAX_ASSIGNMENT_QUESTIONS) {
    return { valid: false, error: "Çok fazla soru seçildi." };
  }
  return { valid: true, error: null };
}
