import { useLocalSearchParams } from "expo-router";

import { AnswerReviewScreen } from "@features/teacher/screens/AnswerReviewScreen";
import { useThemeSubscription } from "@theme/ThemeProvider";

// Phase 97 — class-scoped answer review. The route carries no authority: the
// queue, the detail and the decision are server callables that verify the
// caller is this class's canonical teacher on every call.
export default function TeacherClassAnswerReviews() {
  useThemeSubscription();
  const { classId } = useLocalSearchParams<{ classId: string }>();
  return <AnswerReviewScreen classId={classId} />;
}
