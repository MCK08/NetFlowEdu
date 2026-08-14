import { useLocalSearchParams } from "expo-router";

import { CreateAssignmentScreen } from "@features/assignments/screens/CreateAssignmentScreen";

export default function TeacherCreateAssignment() {
  const { classId, subject, topic, studentIds } = useLocalSearchParams<{
    classId: string;
    subject?: string;
    topic?: string;
    studentIds?: string;
  }>();
  return (
    <CreateAssignmentScreen
      classId={classId}
      initialSubject={subject}
      initialTopic={topic}
      initialTargetStudentIds={studentIds}
    />
  );
}
