import { useLocalSearchParams } from "expo-router";

import { ClassChatScreen } from "@features/classes";
import { useThemeSubscription } from "@theme/ThemeProvider";

export default function TeacherClassChat() {
  useThemeSubscription();
  const { classId } = useLocalSearchParams<{ classId: string }>();
  return <ClassChatScreen classId={classId} />;
}
