import { PlanSettingsScreen } from "@features/studyPlan";
import { useThemeSubscription } from "@theme/ThemeProvider";

// Phase 108 — Planını Özelleştir.
export default function StudentPlanSettingsRoute() {
  useThemeSubscription();
  return <PlanSettingsScreen />;
}
