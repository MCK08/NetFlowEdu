import { StrengthsScreen } from "@features/studyPlan";
import { useThemeSubscription } from "@theme/ThemeProvider";

// Phase 108 — Güçlü Alanlarım.
export default function StudentStrengthsRoute() {
  useThemeSubscription();
  return <StrengthsScreen />;
}
