import { useLocalSearchParams } from "expo-router";

import { CommentReviewScreen } from "@features/teacher/screens/CommentReviewScreen";
import { useThemeSubscription } from "@theme/ThemeProvider";

// Phase 98 — class-scoped comment review. The route carries no authority: the
// queue, the detail and the decision are server callables that verify the
// caller is this class's canonical teacher on every call.
export default function TeacherClassCommentReviews() {
  useThemeSubscription();
  const { classId } = useLocalSearchParams<{ classId: string }>();
  return <CommentReviewScreen classId={classId} />;
}
