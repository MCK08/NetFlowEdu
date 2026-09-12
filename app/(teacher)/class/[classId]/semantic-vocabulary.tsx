import { useLocalSearchParams } from "expo-router";

import { SemanticVocabularyScreen } from "@features/teacher/screens/SemanticVocabularyScreen";
import { useThemeSubscription } from "@theme/ThemeProvider";

export default function TeacherClassSemanticVocabulary() {
  useThemeSubscription();
  const { classId } = useLocalSearchParams<{ classId: string }>();
  return <SemanticVocabularyScreen classId={classId} />;
}
