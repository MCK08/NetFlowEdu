import { AnalyticsOverviewScreen } from "@features/studentAnalytics";
import { useThemeSubscription } from "@theme/ThemeProvider";

// Phase 107 — Kişisel Analiz, the student's learning history.
// Phase 109 — a nested reading reached from Profil and Çalış, no longer a tab.
export default function StudentAnalyticsRoute() {
  useThemeSubscription();
  return <AnalyticsOverviewScreen />;
}
