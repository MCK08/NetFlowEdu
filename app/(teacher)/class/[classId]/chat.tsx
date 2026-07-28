import { useLocalSearchParams } from "expo-router";

import { ClassChatScreen } from "@features/classes";

export default function TeacherClassChat() {
  const { classId } = useLocalSearchParams<{ classId: string }>();
  return <ClassChatScreen classId={classId} />;
}
