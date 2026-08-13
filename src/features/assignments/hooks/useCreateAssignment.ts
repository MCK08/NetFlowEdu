import { useState } from "react";

import { getClassQuestionsPage } from "@services/questions/questions";

import { AssignmentStatus } from "../domain/assignmentTypes";
import { resolveTargetStudentIds, TargetStudentMode, validateAssignmentDraft } from "../services/assignmentCreation";
import { selectAssignmentQuestions } from "../services/assignmentQuestionSelection";
import { createAssignment } from "../services/assignmentService";

// How many of the class's own (most recent) questions the selector
// considers. A single bounded page, not full pagination through the whole
// class history — a real, honest MVP limit: a very old matching question
// past this page may not be picked. Documented, not hidden; see this
// feature's own audit notes on why unbounded pagination wasn't built this
// phase (§15 "N+1 ekleme YOK" extends to "don't paginate an entire class's
// history just to build one assignment").
const QUESTION_POOL_PAGE_SIZE = 100;

export interface CreateAssignmentDraftInput {
  title: string;
  description: string | null;
  subject: string;
  topic: string;
  gradeLevel: string;
  targetMode: TargetStudentMode;
  allClassStudentIds: readonly string[];
  selectedStudentIds: readonly string[];
  requestedQuestionCount: number;
  dueAt: number | null;
  status: AssignmentStatus;
}

export function useCreateAssignment(params: {
  classId: string;
  organizationId: string | null;
  teacherId: string | undefined;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(input: CreateAssignmentDraftInput): Promise<string | null> {
    if (!params.teacherId) return null;
    setIsCreating(true);
    setError(null);
    try {
      const pool = await getClassQuestionsPage(params.classId, QUESTION_POOL_PAGE_SIZE, null);
      const questionIds = selectAssignmentQuestions(
        pool.questions,
        { subject: input.subject, topic: input.topic, gradeLevel: input.gradeLevel },
        input.requestedQuestionCount,
      );
      const targetStudentIds = resolveTargetStudentIds(
        input.targetMode,
        input.allClassStudentIds,
        input.selectedStudentIds,
      );

      const validation = validateAssignmentDraft({
        title: input.title,
        targetStudentIds,
        questionIds,
        description: input.description,
      });
      if (!validation.valid) {
        setError(validation.error);
        return null;
      }

      const assignmentId = await createAssignment({
        classId: params.classId,
        organizationId: params.organizationId,
        teacherId: params.teacherId,
        title: input.title.trim(),
        description: input.description,
        subject: input.subject,
        topic: input.topic,
        gradeLevel: input.gradeLevel,
        targetStudentIds,
        questionIds,
        dueAt: input.dueAt,
        status: input.status,
      });
      return assignmentId;
    } catch {
      setError("Ödev oluşturulamadı. Lütfen tekrar deneyin.");
      return null;
    } finally {
      setIsCreating(false);
    }
  }

  return { create, isCreating, error };
}
