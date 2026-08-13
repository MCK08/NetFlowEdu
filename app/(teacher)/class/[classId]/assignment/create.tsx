import { useLocalSearchParams } from "expo-router";

import { CreateAssignmentScreen } from "@features/assignments/screens/CreateAssignmentScreen";

export default function TeacherCreateAssignment() {
  const { classId, subject, topic } = useLocalSearchParams<{
    classId: string;
    subject?: string;
    topic?: string;
  }>();
  return <CreateAssignmentScreen classId={classId} initialSubject={subject} initialTopic={topic} />;
}
