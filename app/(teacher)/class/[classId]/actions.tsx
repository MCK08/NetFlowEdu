import { useLocalSearchParams } from "expo-router";

import { TeacherActionCenterScreen } from "@features/teacher/screens/TeacherActionCenterScreen";
import { useThemeSubscription } from "@theme/ThemeProvider";

export default function TeacherClassActions() {
  useThemeSubscription();
  const { classId } = useLocalSearchParams<{ classId: string }>();
  return <TeacherActionCenterScreen classId={classId} />;
}
