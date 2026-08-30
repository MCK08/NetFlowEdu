import { StudentLearningStoryScreen } from "@features/learningStory";
import { useThemeSubscription } from "@theme/ThemeProvider";

// Phase 49 — wrapped so this route has a body to subscribe to theme changes.
export default function StudentLearningStoryRoute() {
  useThemeSubscription();
  return <StudentLearningStoryScreen />;
}
