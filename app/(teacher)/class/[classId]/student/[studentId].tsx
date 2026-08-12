import { useLocalSearchParams } from "expo-router";

import { StudentPerformanceScreen } from "@features/teacher/screens/StudentPerformanceScreen";

export default function TeacherStudentPerformance() {
  const { classId, studentId, studentName } = useLocalSearchParams<{
    classId: string;
    studentId: string;
    studentName?: string;
  }>();
  return <StudentPerformanceScreen classId={classId} studentId={studentId} studentName={studentName} />;
}
