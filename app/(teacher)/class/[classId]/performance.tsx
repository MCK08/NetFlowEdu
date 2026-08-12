import { useLocalSearchParams } from "expo-router";

import { ClassPerformanceScreen } from "@features/teacher/screens/ClassPerformanceScreen";

export default function TeacherClassPerformance() {
  const { classId } = useLocalSearchParams<{ classId: string }>();
  return <ClassPerformanceScreen classId={classId} />;
}
