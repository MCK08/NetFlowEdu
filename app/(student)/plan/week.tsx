import { WeeklyPlanScreen } from "@features/studyPlan";
import { useThemeSubscription } from "@theme/ThemeProvider";

// Phase 108 — Haftalık Plan.
export default function StudentPlanWeekRoute() {
  useThemeSubscription();
  return <WeeklyPlanScreen />;
}
