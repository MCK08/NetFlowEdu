import { useLocalSearchParams } from "expo-router";

import { AnswerScreen } from "@features/answers";
import { QuestionVisibility } from "@/types/question";

const VALID_VISIBILITIES: readonly QuestionVisibility[] = ["private", "public", "class"];

export default function Answer() {
  const { questionId, visibility } = useLocalSearchParams<{
    questionId: string;
    visibility?: string;
  }>();

  // Defaults to the strictest option (private) if the param is missing or
  // unrecognized, so a malformed/omitted param can never accidentally
  // widen Storage access — see app/(student)/question/[questionId].tsx's
  // QuestionDetailCard, the only place this param is ever set, from the
  // already-loaded Question it has in hand.
  const questionVisibility: QuestionVisibility = VALID_VISIBILITIES.includes(
    visibility as QuestionVisibility,
  )
    ? (visibility as QuestionVisibility)
    : "private";

  return <AnswerScreen questionId={questionId} questionVisibility={questionVisibility} />;
}
