import { useState } from "react";

import { mapWithConcurrency } from "@features/teacher/services/boundedConcurrency";
import { getClassSourcedStudyItems } from "@features/study/services/studyService";

import { AssignmentStatus } from "../domain/assignmentTypes";
import { resolveTargetStudentIds, TargetStudentMode, validateAssignmentDraft } from "../services/assignmentCreation";
import { fetchAssignmentQuestionPool } from "../services/assignmentQuestionPool";
import {
  buildHistoricalQuestionSignals,
  mergeQuestionSignals,
  selectRecentTopicAssignments,
} from "../services/assignmentHistorySignals";
import {
  AssignmentSelectionStrategy,
  buildTargetedQuestionSignals,
  selectSmartAssignmentQuestions,
  SmartSelectionResult,
  TargetedQuestionSignal,
} from "../services/smartAssignmentSelection";
import { createAssignment, getAssignmentSubmissions, getClassAssignments } from "../services/assignmentService";
import { logAssignmentError, mapAssignmentPrepareError, mapAssignmentPublishError } from "../services/assignmentPublishMessages";

// Caps how many targeted-student studyItems reads are ever simultaneously
// in flight for "reinforce" strategy — same helper, same reasoning as
// useClassPerformance's own per-student fan-out (Phase 27).
const SIGNAL_FETCH_CONCURRENCY = 8;

export interface PrepareSelectionInput {
  subject: string;
  topic: string;
  gradeLevel: string;
  targetMode: TargetStudentMode;
  allClassStudentIds: readonly string[];
  selectedStudentIds: readonly string[];
  requestedQuestionCount: number;
  strategy: AssignmentSelectionStrategy;
}

export interface PublishAssignmentInput {
  title: string;
  description: string | null;
  dueAt: number | null;
  status: AssignmentStatus;
}

export function useCreateAssignment(params: {
  classId: string;
  organizationId: string | null;
  teacherId: string | undefined;
}) {
  const [isPreparing, setIsPreparing] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<SmartSelectionResult | null>(null);
  // Held alongside the preview so publish() writes the EXACT snapshot the
  // teacher saw — never a silent re-selection (§14 "strategy değiştirerek
  // question set'i sessizce yeniden üretme").
  const [preparedTargetStudentIds, setPreparedTargetStudentIds] = useState<string[]>([]);
  const [preparedSubject, setPreparedSubject] = useState("");
  const [preparedTopic, setPreparedTopic] = useState("");
  const [preparedGradeLevel, setPreparedGradeLevel] = useState("");

  async function prepare(input: PrepareSelectionInput): Promise<SmartSelectionResult | null> {
    setIsPreparing(true);
    setError(null);
    setPreview(null);
    try {
      const targetStudentIds = resolveTargetStudentIds(
        input.targetMode,
        input.allClassStudentIds,
        input.selectedStudentIds,
      );
      if (targetStudentIds.length === 0) {
        setError("En az bir öğrenci seçmelisiniz.");
        return null;
      }

      const criteria = { subject: input.subject, topic: input.topic, gradeLevel: input.gradeLevel };
      const pool = await fetchAssignmentQuestionPool(params.classId, criteria, input.requestedQuestionCount);

      // Only "reinforce" pays for the extra per-student read (and the
      // Phase 31 assignment-history read below) — "focus" and "balanced"
      // never touch a targeted student's own study history or past
      // assignments.
      let signals: ReadonlyMap<string, TargetedQuestionSignal> = new Map();
      if (input.strategy === "reinforce") {
        const [studyItemsByStudent, classAssignments] = await Promise.all([
          mapWithConcurrency(targetStudentIds, SIGNAL_FETCH_CONCURRENCY, (studentUid) =>
            getClassSourcedStudyItems(studentUid, params.classId),
          ),
          getClassAssignments(params.classId),
        ]);
        const liveSignals = buildTargetedQuestionSignals(studyItemsByStudent);

        // Bounded (see MAX_HISTORY_ASSIGNMENTS) — at most a handful of
        // extra submissions-subcollection reads, never per-student, never
        // unbounded (§14 "N+1 YOK").
        const historyAssignments = selectRecentTopicAssignments(classAssignments, input.topic, null);
        const historySubmissions = await Promise.all(
          historyAssignments.map((assignment) => getAssignmentSubmissions(assignment.id)),
        );
        const submissionsByAssignmentId = new Map(
          historyAssignments.map((assignment, index) => [assignment.id, historySubmissions[index] ?? []]),
        );
        const historicalSignals = buildHistoricalQuestionSignals(historyAssignments, submissionsByAssignmentId);

        signals = mergeQuestionSignals(liveSignals, historicalSignals);
      }

      const result = selectSmartAssignmentQuestions({
        pool,
        criteria,
        targetCount: input.requestedQuestionCount,
        strategy: input.strategy,
        targetedQuestionSignals: signals,
        now: Date.now(),
      });

      if (result.selected.length === 0) {
        setError("Bu kriterlere uyan soru bulunamadı.");
        return null;
      }

      setPreview(result);
      setPreparedTargetStudentIds(targetStudentIds);
      setPreparedSubject(input.subject);
      setPreparedTopic(input.topic);
      setPreparedGradeLevel(input.gradeLevel);
      return result;
    } catch (err) {
      // The real Firebase error (code/message) must never be discarded by a
      // bare `catch {}` — that is exactly what made a real prepare/publish
      // failure unreproducible from a user report alone (Phase 33 audit).
      // Logged in dev only; the user always sees the safe mapped message.
      logAssignmentError("prepare", err);
      setError(mapAssignmentPrepareError(err));
      return null;
    } finally {
      setIsPreparing(false);
    }
  }

  async function publish(input: PublishAssignmentInput): Promise<string | null> {
    if (!params.teacherId || !preview) return null;
    setIsPublishing(true);
    setError(null);
    try {
      const questionIds = preview.selected.map((entry) => entry.questionId);
      const validation = validateAssignmentDraft({
        title: input.title,
        targetStudentIds: preparedTargetStudentIds,
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
        subject: preparedSubject,
        topic: preparedTopic,
        gradeLevel: preparedGradeLevel,
        targetStudentIds: preparedTargetStudentIds,
        questionIds,
        dueAt: input.dueAt,
        status: input.status,
      });
      return assignmentId;
    } catch (err) {
      logAssignmentError("publish", err);
      setError(mapAssignmentPublishError(err));
      return null;
    } finally {
      setIsPublishing(false);
    }
  }

  function resetPreview() {
    setPreview(null);
    setError(null);
  }

  return { prepare, publish, resetPreview, preview, isPreparing, isPublishing, error };
}
