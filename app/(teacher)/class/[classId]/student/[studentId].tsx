import { useLocalSearchParams } from "expo-router";

import { StudentPerformanceScreen } from "@features/teacher/screens/StudentPerformanceScreen";
import { useThemeSubscription } from "@theme/ThemeProvider";

export default function TeacherStudentPerformance() {
  useThemeSubscription();
  const { classId, studentId, studentName } = useLocalSearchParams<{
    classId: string;
    studentId: string;
    studentName?: string;
  }>();
  return <StudentPerformanceScreen classId={classId} studentId={studentId} studentName={studentName} />;
}
