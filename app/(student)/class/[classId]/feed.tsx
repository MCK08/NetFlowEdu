import { useLocalSearchParams } from "expo-router";

import { ClassFeedScreen } from "@features/classes";

export default function StudentClassFeed() {
  const { classId } = useLocalSearchParams<{ classId: string }>();
  return <ClassFeedScreen classId={classId} />;
}
