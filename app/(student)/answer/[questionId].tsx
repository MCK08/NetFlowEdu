import { useLocalSearchParams } from "expo-router";

import { AnswerScreen } from "@features/answers";
import { useThemeSubscription } from "@theme/ThemeProvider";

export default function Answer() {
  useThemeSubscription();
  const { questionId } = useLocalSearchParams<{ questionId: string }>();

  // Phase 17B removed the `visibility` param that used to be threaded through
  // here. It existed so the CLIENT could pick the Storage access-level
  // segment for its upload path — but the client no longer chooses where an
  // answer image lands. It uploads to a private quarantine path, and
  // submitAnswerForModeration reads the question document itself to decide
  // the approved path once the image has been cleared.
  //
  // That is strictly safer: a client-supplied visibility could previously
  // widen the destination (a "private" question answered into
  // answers/public/...). Deriving it server-side from the question makes that
  // unrepresentable rather than merely validated.
  return <AnswerScreen questionId={questionId} />;
}
