import { useCallback, useEffect, useRef, useState } from "react";

import { getClassMembers } from "@services/firebase/classes";
import { getClassSourcedStudyItems } from "@features/study/services/studyService";
import { resolveQuestionMetadata } from "@features/study/services/studyMetadataCache";
import { mapStudyErrorToMessage } from "@features/study/services/studyErrorMapper";
import { shouldApplyStaleResponse } from "@features/study/services/staleResponseGuard";
import { ClassMember } from "@/types/class";

import {
  buildStudentPerformanceSnapshot,
  classifyStudentSupportTier,
  sortStudentPerformanceCards,
  StudentPerformanceCard,
} from "../services/studentPerformance";

// Phase 27 — the Class Performance dashboard's data layer.
//
// Read cost per class load, N = number of STUDENT members:
//   1 read  — classes/{classId}/members (the whole roster, one collection read)
//   N reads — one getClassSourcedStudyItems query per student (bounded by
//             that class's own question pool, not MAX_ALL_STUDY_ITEMS —
//             see studyService.ts's own doc comment on why this is safe at
//             class scale, unlike downloading each student's entire
//             studyItems history)
//   + however many DISTINCT questions the class has, resolved ONCE via the
//     shared studyMetadataCache (already warm from any prior Feed/Study Hub
//     use this session, and shared across every student — a question two
//     students both studied costs one read, not two).
// No composite index, no new Cloud Function, no new collection.
export function useClassPerformance(classId: string | undefined) {
  const [cards, setCards] = useState<StudentPerformanceCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!classId) {
      setCards([]);
      setIsLoading(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const members = await getClassMembers(classId);
      // Defensive: classes/{classId}/members is keyed by uid, so a true
      // duplicate document is structurally impossible — this only guards
      // against the (still possible) case of the same uid appearing twice
      // across paginated/merged reads in a future change to getClassMembers.
      const students = dedupeMembersByUid(members.filter((member) => member.role === "student"));

      const itemsByStudent = await Promise.all(
        students.map((student) => getClassSourcedStudyItems(student.uid, classId)),
      );
      if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;

      const allQuestionIds = [...new Set(itemsByStudent.flat().map((item) => item.questionId))];
      const questionsById = await resolveQuestionMetadata(allQuestionIds);
      if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;

      const now = Date.now();
      const nextCards: StudentPerformanceCard[] = students.map((student, index) => {
        const snapshot = buildStudentPerformanceSnapshot(itemsByStudent[index] ?? [], questionsById, now);
        return {
          studentUid: student.uid,
          displayName: student.displayName,
          photoURL: student.photoURL,
          snapshot,
          tier: classifyStudentSupportTier(snapshot),
        };
      });

      setCards(sortStudentPerformanceCards(nextCards));
    } catch (err) {
      if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;
      setError(mapStudyErrorToMessage(err));
    } finally {
      // Safe to gate here: load has no in-flight guard blocking a retry, so
      // a superseded call is always followed by a newer one whose own
      // finally settles isLoading — never stuck (unlike a loadMore-style
      // hook with a synchronous in-flight lock; see
      // useReviewSession.ts's loadMore for that case and its fix).
      if (shouldApplyStaleResponse(requestId, requestIdRef.current)) setIsLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    load();
  }, [load]);

  return { cards, isLoading, error, refresh: load };
}

function dedupeMembersByUid(members: readonly ClassMember[]): ClassMember[] {
  const seen = new Set<string>();
  const result: ClassMember[] = [];
  for (const member of members) {
    if (seen.has(member.uid)) continue;
    seen.add(member.uid);
    result.push(member);
  }
  return result;
}
