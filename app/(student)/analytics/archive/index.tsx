import { QuestionArchiveScreen } from "@features/studentAnalytics";
import { useThemeSubscription } from "@theme/ThemeProvider";

// Phase 107 — Çözemediğim Sorular (optional params: subject, topic).
export default function StudentQuestionArchiveRoute() {
  useThemeSubscription();
  return <QuestionArchiveScreen />;
}
