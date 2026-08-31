import { ChronologyProfile, chronologyReasonFor, ChronologyReason } from "./chronologyTieBreak";
import { PracticePlanItem } from "./dailyPracticePlan";

// Phase 61 — deciding whether the timeline may honestly take credit.
//
// WHY THIS COMPARES TWO PLANS
//
// "Show the reason when the top question has a struggling recent sequence" is
// the tempting shortcut, and it is a lie: a question selected purely by Phase
// 41's cumulative evidence often ALSO has a rough recent run, so that rule
// would credit chronology for decisions it had no part in.
//
// The only truthful test is counterfactual — would the plan have been the same
// without chronology? Both plans are pure, in-memory and bounded to a handful
// of items, so running the comparison costs nothing measurable and buys an
// explanation that is actually true.

export interface ChronologyExplanation {
  questionId: string;
  reason: ChronologyReason;
}

/** The explanation for the plan's leading question, or null.
 *
 *  Returns null when chronology changed nothing, when the leading question's
 *  own sequence is not one that can promote it, or when either plan is empty.
 *  Silence is the default: an unexplained good choice is fine, a wrongly
 *  explained one is not. */
export function resolveChronologyExplanation(params: {
  planItems: readonly PracticePlanItem[];
  // The same plan recomputed with no chronology map at all.
  baselinePlanItems: readonly PracticePlanItem[];
  chronologyByQuestionId: ReadonlyMap<string, ChronologyProfile>;
}): ChronologyExplanation | null {
  const leading = params.planItems[0];
  if (!leading) return null;

  // Compared across the whole plan, not just its head: chronology may have
  // reordered positions 2 and 3 while leaving the leader untouched, and that
  // is not something to announce about the leader.
  const baselineLeading = params.baselinePlanItems[0];
  if (!baselineLeading || baselineLeading.questionId === leading.questionId) return null;

  const reason = chronologyReasonFor(params.chronologyByQuestionId.get(leading.questionId));
  if (!reason) return null;

  return { questionId: leading.questionId, reason };
}

// Turkish copy lives at the presentation boundary, not in the ranking layer.
//
// Observational and non-causal: it reports what the recorded sequence shows
// and why that moved the question up. It never promises an outcome ("bu soru
// seni geliştirecek") and never characterises the student.
const REASON_COPY: Readonly<Record<ChronologyReason, string>> = {
  recent_repeated_struggle:
    "Son kayıtlı çalışmalarında bu konuda zorlanma tekrar ettiği için öne alındı.",
  recent_recovery:
    "Son kayıtlı çalışmalarında toparlanma görülüyor; pekiştirmek için tekrar karşına çıktı.",
};

export function chronologyExplanationText(explanation: ChronologyExplanation | null): string | null {
  return explanation ? REASON_COPY[explanation.reason] : null;
}
