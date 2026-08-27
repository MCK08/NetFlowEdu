import { StudyScreen } from "@features/study";
import { useThemeSubscription } from "@theme/ThemeProvider";

// Phase 49 — wrapped rather than re-exported directly so this route has a
// body to subscribe to theme changes from; StudyScreen itself is unchanged.
export default function StudyScreenRoute() {
  useThemeSubscription();
  return <StudyScreen />;
}
