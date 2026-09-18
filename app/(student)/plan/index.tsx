import { PlanHomeScreen } from "@features/studyPlan";
import { useThemeSubscription } from "@theme/ThemeProvider";

// Phase 108 — Çalışma Planım (today's plan).
export default function StudentPlanHomeRoute() {
  useThemeSubscription();
  return <PlanHomeScreen />;
}
