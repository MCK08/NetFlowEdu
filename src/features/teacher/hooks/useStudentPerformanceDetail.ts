import { useCallback, useEffect, useRef, useState } from "react";

import { getClassSourcedStudyItems } from "@features/study/services/studyService";
import { mapStudyErrorToMessage } from "@features/study/services/studyErrorMapper";
import { resolveQuestionMetadata } from "@features/study/services/studyMetadataCache";

import { buildStudentPerformanceSnapshot, StudentPerformanceSnapshot } from "../services/studentPerformance";

// Phase 27 — Student Performance detail screen. Read-only, standalone (does
// not depend on useClassPerformance already having run) so it works from a
// direct navigation too. Reuses the EXACT SAME getClassSourcedStudyItems +
// buildStudentPerformanceSnapshot the class list uses — one student's own
// data, not a re-derivation of anyone else's, and never more than that one
// student's class-sourced items (bounded, not their whole study history).
export function useStudentPerformanceDetail(classId: string | undefined, studentUid: string | undefined) {
  const [snapshot, setSnapshot] = useState<StudentPerformanceSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!classId || !studentUid) {
      setSnapshot(null);
      setIsLoading(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const items = await getClassSourcedStudyItems(studentUid, classId);
      if (requestIdRef.current !== requestId) return;

      const questionsById = await resolveQuestionMetadata(items.map((item) => item.questionId));
      if (requestIdRef.current !== requestId) return;

      setSnapshot(buildStudentPerformanceSnapshot(items, questionsById, Date.now()));
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      setError(mapStudyErrorToMessage(err));
    } finally {
      if (requestIdRef.current === requestId) setIsLoading(false);
    }
  }, [classId, studentUid]);

  useEffect(() => {
    load();
  }, [load]);

  return { snapshot, isLoading, error, refresh: load };
}
