import { useLocalSearchParams } from "expo-router";

import { TeacherLearningStoryScreen } from "@features/learningStory";
import { useThemeSubscription } from "@theme/ThemeProvider";

export default function TeacherLearningStoryRoute() {
  useThemeSubscription();
  const { classId } = useLocalSearchParams<{ classId: string }>();
  return <TeacherLearningStoryScreen classId={classId} />;
}
