import { useLocalSearchParams } from "expo-router";

import { StudySessionScreen } from "@features/study";

export default function StudentAssignmentSession() {
  const { assignmentId } = useLocalSearchParams<{ assignmentId: string }>();
  return <StudySessionScreen mode="assignment" assignmentId={assignmentId} />;
}
