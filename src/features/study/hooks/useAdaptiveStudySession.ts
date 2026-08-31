import { useEffect, useRef, useState } from "react";

import { StudySummary } from "../services/studyService";
import { resolveQuestionMetadata } from "../services/studyMetadataCache";
import { toAdaptiveSessionQuestions } from "../services/studySessionQuestions";
import { shouldApplyStaleResponse } from "../services/staleResponseGuard";
import { Question } from "@/types/question";

import { useLearningTrail } from "@features/learningStory/hooks/useLearningTrail";

import { useLearningInsights } from "./useLearningInsights";

// Phase 28 — "Çalışmaya Devam Et": the FREE/adaptive round that follows a
// completed mandatory review. Reuses useLearningInsights ENTIRELY (the
// exact same hook StudyScreen's "Bugünkü Plan" already renders from) for
// the plan itself — this hook adds nothing to ranking/priority, it only
// resolves that plan's questionIds into real Question objects via the
// SAME shared studyMetadataCache every other study/feed surface already
// warms, so this typically costs zero additional Firestore reads (the
// question was very likely already fetched by useLearningInsights's own
// join a moment earlier).
export function useAdaptiveStudySession(uid: string | undefined, summary: StudySummary) {
  // Phase 61 — the SAME bounded studyEvents query Phase 59 already defined
  // (useLearningTrail), reused rather than duplicated. It resolves once per
  // mount and is not refetched while a session runs, which is what keeps the
  // question order stable: a new outcome influences the NEXT composition, not
  // the session the student is currently in.
  const { events: chronologyEvents } = useLearningTrail(uid);
  const {
    plan,
    isLoading: isLoadingInsights,
    error,
    refresh: refreshInsights,
  } = useLearningInsights(uid, summary, chronologyEvents);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isResolving, setIsResolving] = useState(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (isLoadingInsights) return;
    let cancelled = false;
    const requestId = ++requestIdRef.current;

    async function resolve() {
      setIsResolving(true);
      const metadata = await resolveQuestionMetadata(plan.planItems.map((item) => item.questionId));
      if (cancelled || !shouldApplyStaleResponse(requestId, requestIdRef.current)) return;
      setQuestions(toAdaptiveSessionQuestions(plan.planItems, metadata));
      setIsResolving(false);
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [plan.planItems, isLoadingInsights]);

  return {
    questions,
    isLoading: isLoadingInsights || isResolving,
    error,
    refresh: refreshInsights,
  };
}
