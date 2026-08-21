import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getClassMembers } from "@services/firebase/classes";
import { getClassSourcedStudyItems } from "@features/study/services/studyService";
import { resolveQuestionMetadata } from "@features/study/services/studyMetadataCache";
import { mapStudyErrorToMessage } from "@features/study/services/studyErrorMapper";
import { shouldApplyStaleResponse } from "@features/study/services/staleResponseGuard";
import { ClassMember } from "@/types/class";
import { Question } from "@/types/question";

import { mapWithConcurrency } from "../services/boundedConcurrency";
import { buildClassTopicHotspots, ClassTopicHotspot } from "../services/classTopicInsights";
import { buildClassTrend } from "../services/classTrend";
import {
  buildStudentPerformanceSnapshot,
  classifyStudentSupportTier,
  sortStudentPerformanceCards,
  StudentPerformanceCard,
} from "../services/studentPerformance";
import {
  buildStudentAttentionInsight,
  sortStudentAttentionCards,
  StudentAttentionCard,
} from "../services/studentAttention";
import { LearningTrend } from "@features/study/services/learningTrend";

// Caps how many per-student studyItems queries are ever simultaneously in
// flight — see boundedConcurrency.ts's own doc comment. Chosen as a small,
// safe default; not tuned against real traffic (there is none to tune
// against yet), only against "don't fire 30+ queries in the same tick".
const STUDENT_FETCH_CONCURRENCY = 8;

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
  // Phase 43 — the question metadata resolved by THIS hook's own load()
  // below, kept so the topic-hotspot memo can read each topic's real grade.
  // Not a second fetch: it is the exact map the snapshots were built from.
  const [questionsById, setQuestionsById] = useState<ReadonlyMap<string, Question | null>>(new Map());
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

      const itemsByStudent = await mapWithConcurrency(students, STUDENT_FETCH_CONCURRENCY, (student) =>
        getClassSourcedStudyItems(student.uid, classId),
      );
      if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;

      const allQuestionIds = [...new Set(itemsByStudent.flat().map((item) => item.questionId))];
      const resolvedQuestions = await resolveQuestionMetadata(allQuestionIds);
      if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;
      setQuestionsById(resolvedQuestions);

      const now = Date.now();
      const nextCards: StudentPerformanceCard[] = students.map((student, index) => {
        const snapshot = buildStudentPerformanceSnapshot(itemsByStudent[index] ?? [], resolvedQuestions, now);
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

  // All three derived ENTIRELY from `cards` — zero additional Firestore
  // reads, zero new fetch/generation state to guard: they inherit `cards`'
  // own staleness protection above for free, and recompute automatically
  // whenever `cards` does (a fresh load, a refresh, a classId change).
  const attentionCards: StudentAttentionCard[] = useMemo(() => {
    const now = Date.now();
    return sortStudentAttentionCards(
      cards.map((card) => ({
        studentUid: card.studentUid,
        displayName: card.displayName,
        insight: buildStudentAttentionInsight(card.snapshot, now),
        successRatePercent: card.snapshot.successRatePercent,
      })),
    );
  }, [cards]);

  const topicHotspots: ClassTopicHotspot[] = useMemo(
    () =>
      buildClassTopicHotspots(
        cards.map((card) => ({ studentUid: card.studentUid, allTopics: card.snapshot.allTopics })),
        // Phase 43 — the SAME question metadata this hook already resolved
        // above, so a hotspot can report the grade its questions agree on.
        // Zero additional reads; held in state only so the memo above can
        // see it, never re-fetched.
        questionsById,
      ),
    [cards, questionsById],
  );

  const trend: LearningTrend = useMemo(
    () => buildClassTrend(cards.map((card) => card.snapshot.dayBuckets)),
    [cards],
  );

  return { cards, attentionCards, topicHotspots, trend, isLoading, error, refresh: load };
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
