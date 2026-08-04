import { Badge } from "@components/ui/Badge";

import { getAnswerMethodLabel } from "../services/answerMethodLabel";
import { AnswerMethod } from "../types";

// Delegates to the shared Badge primitive instead of re-implementing the
// same rounded pill styling — Badge's "primary" variant already matches
// this badge's original colors exactly (primaryMuted bg, primary text).
export function AnswerMethodBadge({ method }: { method: AnswerMethod }) {
  return <Badge label={getAnswerMethodLabel(method)} variant="primary" />;
}
