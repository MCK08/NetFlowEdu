import { useLocalSearchParams } from "expo-router";

import { AssignmentDetailScreen } from "@features/assignments/screens/AssignmentDetailScreen";

export default function TeacherAssignmentDetail() {
  const { assignmentId } = useLocalSearchParams<{ classId: string; assignmentId: string }>();
  return <AssignmentDetailScreen assignmentId={assignmentId} />;
}
