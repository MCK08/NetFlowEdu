import { useLocalSearchParams } from "expo-router";

import { TeacherClassDetailScreen } from "@features/classes";

export default function TeacherClassDetail() {
  const { classId } = useLocalSearchParams<{ classId: string }>();
  return <TeacherClassDetailScreen classId={classId} />;
}
