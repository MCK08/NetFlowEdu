import { CHOICE_LABELS, ChoiceLabel, QuestionChoices } from "@/types/question";

import { isChoiceLabel } from "./multipleChoice";

// Phase 77 — optional AUTHOR-WRITTEN feedback attached to a specific wrong
// answer choice.
//
// Pure, React/Firebase-free, exactly like multipleChoice.ts and
// questionHints.ts beside it: the write half (sanitizeChoiceFeedback) and the
// read half (parseChoiceFeedbackFromUnknown) live together so the two can
// never disagree about what a legal mapping is, and both are directly
// unit-testable without mocking Firestore.
//
// THE TRUST RULE, AND WHAT IT COSTS
//
// Every sentence a student sees here was typed by the question's author.
// Nothing generates, rewrites, expands, translates or infers it, and there is
// no model anywhere in this path.
//
// Phase 71 established why that matters: the repository has no misconception
// taxonomy and never persisted the selected answer as semantic evidence, so a
// mistake label could not be truthfully inferred. This phase does not quietly
// become that inference. What it adds is narrower and honest — an author may
// say what a PARTICULAR OPTION represents, and when a student picks that
// option we repeat the author's words back.
//
// So the claim on screen is "this is what that answer suggests you reconsider",
// never "this is your misconception". One wrong answer is a selected option
// plus an authored interpretation of that option. It is not a durable fact
// about a learner, and nothing here records it as one.
//
// WHY KEYED BY ChoiceLabel
//
// A choice in this codebase is already identified by a stable label:
// `QuestionChoices` is `{A?, B?, C?, D?, E?}` and `correctChoice` is a
// `ChoiceLabel`, not an index into an array and not the option's text. So the
// association this phase needs already exists — no new id scheme, no schema
// migration, and above all no matching on choice TEXT, which would silently
// re-point an author's explanation at a different option the moment they fixed
// a typo. Editing B's wording keeps B's feedback on B; nothing can migrate it
// to A.

/** The instructional response attached to one option. */
export interface ChoiceFeedbackEntry {
  /** What the author wants the student to reconsider. Always non-empty. */
  text: string;
  /**
   * An optional stable, machine-readable name for what this option
   * represents — e.g. "sign_transfer_error".
   *
   * AUTHORED OR NOTHING. It is never derived from the question text, the
   * option text, wrong-answer frequency, or any model. It is never shown to
   * the student; the student reads `text`. It exists so a later phase can
   * group the same authored meaning across questions without guessing, and it
   * is null until an author actually types one.
   */
  conceptKey: string | null;
}

export type QuestionChoiceFeedback = Partial<Record<ChoiceLabel, ChoiceFeedbackEntry>>;

// Longer than a hint (200) because this carries two jobs in one breath — what
// to reconsider, and where to look next — but still well under a question's
// own description cap of 300. A feedback note is a redirection, not a worked
// solution: an author who needs more than this is writing the lesson, not the
// correction.
export const MAX_CHOICE_FEEDBACK_LENGTH = 240;

// Long enough for a readable compound name, short enough that it stays a key
// rather than becoming a sentence.
export const MAX_CONCEPT_KEY_LENGTH = 48;

/** Normalises an authored semantic key, or null when it is not usable.
 *
 *  Lowercased and reduced to `[a-z0-9_]` so the same intent typed two ways
 *  ("Sign Transfer Error" / "sign-transfer-error") lands on one key. This is
 *  formatting, never interpretation: it cannot invent a key, cannot merge two
 *  different words, and returns null rather than guessing at something that
 *  normalises to nothing. */
export function normalizeConceptKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  if (slug.length === 0) return null;
  return slug.slice(0, MAX_CONCEPT_KEY_LENGTH);
}

function cleanEntry(value: unknown): ChoiceFeedbackEntry | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const rawText = record.text;
  if (typeof rawText !== "string") return null;
  const text = rawText.trim();
  // A blank note is not "feedback the student did not see" — it is an author
  // who started typing and stopped. Dropped outright, exactly as sanitizeHints
  // drops an empty rung.
  if (text.length === 0) return null;
  return {
    text: text.slice(0, MAX_CHOICE_FEEDBACK_LENGTH),
    conceptKey: normalizeConceptKey(record.conceptKey),
  };
}

/** Raw author input -> what is actually worth persisting.
 *
 *  Validated AGAINST the question's own options rather than in isolation,
 *  which is what keeps the association honest over an edit:
 *
 *   · An entry for a label with no (or a now-blank) option is DROPPED. An
 *     explanation for an option that is not on screen can never be shown, and
 *     leaving it would let it reappear attached to whatever the author later
 *     types into that slot.
 *   · An entry for the CORRECT choice is dropped. This feedback answers "why
 *     might someone pick this wrong option"; keeping one on the right answer
 *     would make its meaning ambiguous the moment `correctChoice` moved.
 *
 *  Note what is deliberately NOT done: nothing is ever re-pointed at a
 *  different label to rescue it. Dropping is the only safe repair — a
 *  misattributed explanation is worse than a missing one. */
export function sanitizeChoiceFeedback(
  raw: Partial<Record<ChoiceLabel, unknown>> | null | undefined,
  choices: QuestionChoices | null | undefined,
  correctChoice: ChoiceLabel | null | undefined,
): QuestionChoiceFeedback | null {
  if (!raw || !choices) return null;
  const result: QuestionChoiceFeedback = {};
  let count = 0;
  for (const label of CHOICE_LABELS) {
    if (label === correctChoice) continue;
    if (!choices[label]?.trim()) continue;
    const entry = cleanEntry(raw[label]);
    if (!entry) continue;
    result[label] = entry;
    count += 1;
  }
  return count > 0 ? result : null;
}

/** The READ half — parses whatever a Firestore document actually holds.
 *
 *  Truly `unknown`: a pre-Phase-77 document has no `choiceFeedback` field at
 *  all, and nothing stops a hand-edited or corrupted document from holding a
 *  garbage shape. Runs through the same rules as the write half — including
 *  the "must name a real, non-correct option" check — so a document that went
 *  stale because its choices changed elsewhere still cannot surface an
 *  explanation for an option the student is not looking at.
 *
 *  Iterates the KNOWN labels rather than the stored object's own keys, so a
 *  malformed record cannot introduce a sixth option or pollute a prototype. */
export function parseChoiceFeedbackFromUnknown(
  value: unknown,
  choices: QuestionChoices | null,
  correctChoice: ChoiceLabel | null,
): QuestionChoiceFeedback | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (!choices) return null;
  const record = value as Record<string, unknown>;
  const raw: Partial<Record<ChoiceLabel, unknown>> = {};
  for (const label of CHOICE_LABELS) raw[label] = record[label];
  return sanitizeChoiceFeedback(raw, choices, correctChoice);
}

/** True when this question actually carries authored choice feedback. */
export function hasChoiceFeedback(feedback: QuestionChoiceFeedback | null | undefined): boolean {
  if (!feedback) return false;
  return CHOICE_LABELS.some((label) => Boolean(feedback[label]?.text));
}

/** The subset of a question this resolver needs. Structural on purpose so a
 *  caller can pass a full `Question` or a fixture without a cast. */
export interface ChoiceFeedbackSource {
  choices: QuestionChoices | null;
  correctChoice: ChoiceLabel | null;
  choiceFeedback: QuestionChoiceFeedback | null;
}

/** The verified authored response for the option the student actually picked,
 *  or null.
 *
 *  Null is returned — never a substitute, never a neighbouring entry, never a
 *  generic sentence — when:
 *
 *   · the pick is the CORRECT answer (this is wrong-answer guidance; see the
 *     phase doc on why correct-answer rationale was not added for symmetry),
 *   · the picked label is not a real option on this question,
 *   · the author attached nothing to that option.
 *
 *  An unexplained wrong answer keeps exactly the behaviour it had before this
 *  phase. Saying nothing is the honest output; inventing a reason would be the
 *  one failure this whole feature exists to avoid. */
export function resolveChoiceFeedback(
  source: ChoiceFeedbackSource,
  selected: ChoiceLabel | null,
): ChoiceFeedbackEntry | null {
  if (!selected || !isChoiceLabel(selected)) return null;
  if (!source.choices || !source.choices[selected]?.trim()) return null;
  if (source.correctChoice !== null && selected === source.correctChoice) return null;
  const entry = source.choiceFeedback?.[selected];
  if (!entry || !entry.text.trim()) return null;
  return entry;
}
