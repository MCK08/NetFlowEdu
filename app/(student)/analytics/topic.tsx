import { TopicDetailScreen } from "@features/studentAnalytics";
import { useThemeSubscription } from "@theme/ThemeProvider";

// Phase 107 — Konu Detayı (params: subject, topic).
export default function StudentTopicDetailRoute() {
  useThemeSubscription();
  return <TopicDetailScreen />;
}
