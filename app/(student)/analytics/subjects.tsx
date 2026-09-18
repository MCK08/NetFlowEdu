import { SubjectAnalysisScreen } from "@features/studentAnalytics";
import { useThemeSubscription } from "@theme/ThemeProvider";

// Phase 107 — Derslere Göre Analiz.
export default function StudentSubjectAnalysisRoute() {
  useThemeSubscription();
  return <SubjectAnalysisScreen />;
}
