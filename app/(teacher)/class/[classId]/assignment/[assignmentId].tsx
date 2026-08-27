import { useLocalSearchParams } from "expo-router";

import { AssignmentDetailScreen } from "@features/assignments/screens/AssignmentDetailScreen";
import { useThemeSubscription } from "@theme/ThemeProvider";

export default function TeacherAssignmentDetail() {
  useThemeSubscription();
  const { assignmentId } = useLocalSearchParams<{ classId: string; assignmentId: string }>();
  return <AssignmentDetailScreen assignmentId={assignmentId} />;
}
