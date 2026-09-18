import { ProgressMapScreen } from "@features/studyPlan";
import { useThemeSubscription } from "@theme/ThemeProvider";

// Phase 108 — İlerleme Haritam.
export default function StudentProgressMapRoute() {
  useThemeSubscription();
  return <ProgressMapScreen />;
}
