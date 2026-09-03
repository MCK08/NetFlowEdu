import { StrugglePatternsScreen } from "@features/study";
import { useThemeSubscription } from "@theme/ThemeProvider";

// Phase 49 — wrapped so this route has a body to subscribe to theme changes.
export default function StudentStrugglePatternsRoute() {
  useThemeSubscription();
  return <StrugglePatternsScreen />;
}
