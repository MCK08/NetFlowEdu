import { ArchivedQuestionScreen } from "@features/studentAnalytics";
import { useThemeSubscription } from "@theme/ThemeProvider";

// Phase 107 — one archived question, with context before a retry.
export default function StudentArchivedQuestionRoute() {
  useThemeSubscription();
  return <ArchivedQuestionScreen />;
}
