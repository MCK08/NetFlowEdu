import { useLocalSearchParams } from "expo-router";

import { TeacherClassDetailScreen } from "@features/classes";
import { useThemeSubscription } from "@theme/ThemeProvider";

export default function TeacherClassDetail() {
  useThemeSubscription();
  const { classId } = useLocalSearchParams<{ classId: string }>();
  return <TeacherClassDetailScreen classId={classId} />;
}
