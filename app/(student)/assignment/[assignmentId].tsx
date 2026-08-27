import { useLocalSearchParams } from "expo-router";

import { StudySessionScreen } from "@features/study";
import { useThemeSubscription } from "@theme/ThemeProvider";

export default function StudentAssignmentSession() {
  useThemeSubscription();
  const { assignmentId } = useLocalSearchParams<{ assignmentId: string }>();
  return <StudySessionScreen mode="assignment" assignmentId={assignmentId} />;
}
