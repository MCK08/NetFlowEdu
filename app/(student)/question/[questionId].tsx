import { useLocalSearchParams } from "expo-router";

import { QuestionDetailScreen } from "@features/questions";

export default function QuestionDetail() {
  const { questionId } = useLocalSearchParams<{ questionId: string }>();
  return <QuestionDetailScreen questionId={questionId} />;
}
