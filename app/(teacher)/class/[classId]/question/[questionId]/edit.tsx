import { useLocalSearchParams } from "expo-router";

import { QuestionRevisionScreen } from "@features/teacher/screens/QuestionRevisionScreen";
import { useThemeSubscription } from "@theme/ThemeProvider";

// Phase 86 — owner-only question revision. The route carries no authority:
// the screen loads the question and refuses a non-owner before rendering a
// single field, and the service and firestore.rules refuse the write again.
export default function TeacherQuestionEdit() {
  useThemeSubscription();
  const { classId, questionId } = useLocalSearchParams<{ classId: string; questionId: string }>();
  return <QuestionRevisionScreen classId={classId} questionId={questionId} />;
}
