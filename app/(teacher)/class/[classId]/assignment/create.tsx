import { useLocalSearchParams } from "expo-router";

import { CreateAssignmentScreen } from "@features/assignments/screens/CreateAssignmentScreen";

export default function TeacherCreateAssignment() {
  const { classId, subject, topic, gradeLevel, studentIds } = useLocalSearchParams<{
    classId: string;
    subject?: string;
    topic?: string;
    gradeLevel?: string;
    studentIds?: string;
  }>();
  return (
    <CreateAssignmentScreen
      classId={classId}
      initialSubject={subject}
      initialTopic={topic}
      initialGradeLevel={gradeLevel}
      initialTargetStudentIds={studentIds}
    />
  );
}
