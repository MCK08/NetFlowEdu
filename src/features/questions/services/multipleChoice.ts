// Pure, React/Firebase-free helpers for Phase 21's optional multiple-choice
// answers — kept separate from questions.ts (Firestore I/O) and
// QuestionDetailScreen (React) so every rule here ("what counts as active
// multiple-choice", "is this correctChoice legal", "was the picked answer
// right") is directly unit-testable, same reasoning as classFeedPagination.ts
// and feedItems.ts.
import { CHOICE_LABELS, ChoiceLabel, QuestionChoices } from "@/types/question";

export { CHOICE_LABELS };
export type { ChoiceLabel, QuestionChoices };

export function isChoiceLabel(value: string): value is ChoiceLabel {
  return (CHOICE_LABELS as readonly string[]).includes(value);
}

// Raw editor state -> the shape actually worth persisting. Trims every
// value and drops empties outright — Firestore never stores a blank
// option, and "2+ filled options" is what the product spec calls "multiple
// choice is active" at all. Fewer than 2 non-empty options means multiple
// choice was never really turned on (e.g. the user typed one option then
// changed their mind), so this returns null rather than a single-option
// "choices" object no UI could sensibly render as a question.
export function sanitizeChoices(raw: Partial<Record<ChoiceLabel, string>> | null | undefined): QuestionChoices | null {
  if (!raw) return null;
  const trimmed: QuestionChoices = {};
  let filledCount = 0;
  for (const label of CHOICE_LABELS) {
    const value = raw[label];
    if (typeof value !== "string") continue;
    const clean = value.trim();
    if (clean.length === 0) continue;
    trimmed[label] = clean;
    filledCount += 1;
  }
  return filledCount >= 2 ? trimmed : null;
}

// True only when `choices` actually has 2+ real options — the single
// definition of "this question is multiple-choice" that every other
// function/component here and in the UI defers to, so that decision is
// never independently re-derived (and never drifts) in two places.
export function hasMultipleChoice(choices: QuestionChoices | null | undefined): choices is QuestionChoices {
  if (!choices) return false;
  return CHOICE_LABELS.filter((label) => Boolean(choices[label]?.trim())).length >= 2;
}

// A correctChoice is only ever legal if it names an option that's actually
// present (and non-empty) in `choices` — "correctChoice without choices",
// "correctChoice pointing at a blank/missing option", and "choices without
// any correctChoice at all" are the three shapes buildChoicesPayload below
// exists specifically to make unrepresentable in what gets persisted.
export function isValidCorrectChoice(
  choices: QuestionChoices | null | undefined,
  correctChoice: string | null | undefined,
): correctChoice is ChoiceLabel {
  if (!correctChoice || !isChoiceLabel(correctChoice)) return false;
  if (!choices) return false;
  return Boolean(choices[correctChoice]?.trim());
}

export interface ChoicesPayload {
  choices: QuestionChoices | null;
  correctChoice: ChoiceLabel | null;
}

// The one place both the upload validation AND the Firestore write build
// this pair from raw editor state — guarantees the two fields can never be
// saved out of sync (a correctChoice with no matching choices, or choices
// with a stale correctChoice from before an option was cleared).
export function buildChoicesPayload(
  rawChoices: Partial<Record<ChoiceLabel, string>> | null | undefined,
  rawCorrectChoice: string | null | undefined,
): ChoicesPayload {
  const choices = sanitizeChoices(rawChoices);
  if (!choices) return { choices: null, correctChoice: null };
  const correctChoice = isValidCorrectChoice(choices, rawCorrectChoice) ? (rawCorrectChoice as ChoiceLabel) : null;
  return { choices, correctChoice };
}

// The READ half of serialization — parses whatever a Firestore document
// actually has under `choices`/`correctChoice` (truly `unknown`: a
// pre-Phase-21 document has neither field at all, and nothing stops a
// hand-edited/corrupted document from having a garbage shape). Kept here,
// not in questions.ts/savedQuestions.ts, so it stays free of any Firebase
// import and is directly unit-testable without mocking Firebase — both of
// those files import and use these instead of keeping their own copies.
export function parseChoicesFromUnknown(value: unknown): QuestionChoices | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const result: QuestionChoices = {};
  for (const label of CHOICE_LABELS) {
    const raw = record[label];
    if (typeof raw === "string" && raw.trim().length > 0) result[label] = raw;
  }
  return Object.keys(result).length >= 2 ? result : null;
}

// A correctChoice is only ever meaningful alongside a valid `choices` — a
// stray correctChoice on a document whose choices didn't survive
// parseChoicesFromUnknown must never be trusted (it would let the UI claim
// a "doğru cevap" that doesn't exist on screen).
export function parseCorrectChoiceFromUnknown(
  value: unknown,
  choices: QuestionChoices | null,
): ChoiceLabel | null {
  if (!choices || typeof value !== "string") return null;
  return isChoiceLabel(value) && Boolean(choices[value]) ? value : null;
}

export type AnswerEvaluation = "correct" | "incorrect";

// The one comparison QuestionDetailScreen's answer UI needs — kept pure and
// separate from that component (and from StudyOutcome/recordStudyOutcome,
// which this must never touch: picking a multiple-choice answer is not a
// study outcome).
export function evaluateChoice(correctChoice: ChoiceLabel | null, selected: ChoiceLabel): AnswerEvaluation {
  return selected === correctChoice ? "correct" : "incorrect";
}
