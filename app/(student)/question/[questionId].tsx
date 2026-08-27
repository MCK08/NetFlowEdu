import { useLocalSearchParams } from "expo-router";

import { QuestionDetailScreen } from "@features/questions";
import { useThemeSubscription } from "@theme/ThemeProvider";

export default function QuestionDetail() {
  useThemeSubscription();
  const { questionId } = useLocalSearchParams<{ questionId: string }>();
  return <QuestionDetailScreen questionId={questionId} />;
}
