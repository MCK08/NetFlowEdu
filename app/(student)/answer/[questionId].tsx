import { useLocalSearchParams } from "expo-router";

import { AnswerScreen } from "@features/answers";

export default function Answer() {
  const { questionId } = useLocalSearchParams<{ questionId: string }>();
  return <AnswerScreen questionId={questionId} />;
}
