import { QuestionTypeAnalysisScreen } from "@features/studentAnalytics";
import { useThemeSubscription } from "@theme/ThemeProvider";

// Phase 107 — Soru Türlerine Göre.
export default function StudentQuestionTypeAnalysisRoute() {
  useThemeSubscription();
  return <QuestionTypeAnalysisScreen />;
}
