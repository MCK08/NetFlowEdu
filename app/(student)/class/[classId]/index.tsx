import { useLocalSearchParams } from "expo-router";

import { StudentClassDetailScreen } from "@features/classes";

export default function StudentClassDetail() {
  const { classId } = useLocalSearchParams<{ classId: string }>();
  return <StudentClassDetailScreen classId={classId} />;
}
