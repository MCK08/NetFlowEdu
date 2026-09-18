import { router } from "expo-router";
import { useCallback } from "react";

import { ROUTES } from "@constants/routes";
import { ANALYTICS_ROUTES, questionSolvingRoute } from "@features/studentAnalytics/routes";
import { useNavigationGuard } from "@hooks/useNavigationGuard";

import { PlanStep } from "../services/dailyPlan";

// Phase 108 — "Adıma Başla". Every target is a surface that already exists:
// the archive (scoped to the step's topic), the review session, the adaptive
// session, one question, or the assignment session. The plan adds no
// question renderer and no evaluation path of its own.
export function usePlanStepNavigation() {
  const guardedNavigate = useNavigationGuard();

  return useCallback(
    (step: PlanStep) => {
      const target = step.target;
      guardedNavigate(`plan-step-${step.id}`, () => {
        switch (target.kind) {
          case "archive":
            router.push(
              `${ANALYTICS_ROUTES.archive}?subject=${encodeURIComponent(target.subject)}&topic=${encodeURIComponent(target.topic)}` as never,
            );
            return;
          case "review_session":
            router.push(ROUTES.studentReviewSession as never);
            return;
          case "adaptive_session":
            router.push(ROUTES.studentAdaptiveSession as never);
            return;
          case "question":
            router.push(questionSolvingRoute(target.questionId) as never);
            return;
          case "assignment":
            router.push(`/(student)/assignment/${encodeURIComponent(target.assignmentId)}` as never);
            return;
        }
      });
    },
    [guardedNavigate],
  );
}
