import { PlanStepScreen } from "@features/studyPlan";
import { useThemeSubscription } from "@theme/ThemeProvider";

// Phase 108 — Bugünün Adımı (param: stepId).
export default function StudentPlanStepRoute() {
  useThemeSubscription();
  return <PlanStepScreen />;
}
