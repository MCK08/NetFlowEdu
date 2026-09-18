import { AnalyticsOverviewScreen } from "@features/studentAnalytics";
import { useThemeSubscription } from "@theme/ThemeProvider";

// Phase 107 — Kişisel Analiz, the student's learning history (a root tab).
export default function StudentAnalyticsRoute() {
  useThemeSubscription();
  return <AnalyticsOverviewScreen />;
}
