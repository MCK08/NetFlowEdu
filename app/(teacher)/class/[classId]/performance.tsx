import { useLocalSearchParams } from "expo-router";

import { ClassPerformanceScreen } from "@features/teacher/screens/ClassPerformanceScreen";
import { useThemeSubscription } from "@theme/ThemeProvider";

export default function TeacherClassPerformance() {
  useThemeSubscription();
  const { classId } = useLocalSearchParams<{ classId: string }>();
  return <ClassPerformanceScreen classId={classId} />;
}
