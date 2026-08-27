import { useLocalSearchParams } from "expo-router";

import { StudentClassDetailScreen } from "@features/classes";
import { useThemeSubscription } from "@theme/ThemeProvider";

export default function StudentClassDetail() {
  useThemeSubscription();
  const { classId } = useLocalSearchParams<{ classId: string }>();
  return <StudentClassDetailScreen classId={classId} />;
}
