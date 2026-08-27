import { useLocalSearchParams } from "expo-router";

import { ClassFeedScreen } from "@features/classes";
import { useThemeSubscription } from "@theme/ThemeProvider";

export default function StudentClassFeed() {
  useThemeSubscription();
  const { classId } = useLocalSearchParams<{ classId: string }>();
  return <ClassFeedScreen classId={classId} />;
}
