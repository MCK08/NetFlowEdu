import { GapMapScreen } from "@features/studyPlan";
import { useThemeSubscription } from "@theme/ThemeProvider";

// Phase 108 — Eksik Haritam.
export default function StudentGapMapRoute() {
  useThemeSubscription();
  return <GapMapScreen />;
}
