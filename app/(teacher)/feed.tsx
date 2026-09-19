import { TeacherFeedScreen } from "@features/feed";
import { useThemeSubscription } from "@theme/ThemeProvider";

// Phase 111 — the discovery feed, no longer the landing tab: Bugün opens it.
export default function TeacherFeed() {
  useThemeSubscription();
  return <TeacherFeedScreen />;
}
