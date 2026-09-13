// Phase 88 — the AUTHORITATIVE question-revision contract.
//
// WHY THIS FILE EXISTS AT ALL
//
// Phase 86 put question revision in the client and Phase 87 added an optimistic
// conflict check inside a client transaction. Phase 87 then proved the gap
// itself: an authenticated owner could skip both by PATCHing the document
// directly. Everything below is the same contract, moved to where a client
// cannot go around it.
//
// WHY IT IS A MIRROR, AND NOT AN IMPORT
//
// `functions/` is a separate TypeScript project with `rootDir: "src"`, so it
// cannot import `src/features/...`; a file outside the root is a hard compile
// error (verified, not assumed). Making a genuinely shared module work requires
// `rootDir: ".."`, which relocates the compiled entrypoint from `lib/index.js`
// to `lib/functions/src/index.js` — a change to the deploy artifact path that
// cannot be validated from a local emulator.
//
// So this follows the repository's established, documented answer for exactly
// this boundary: a deliberate mirror, the same one
// functions/src/study/semanticChoiceEvidence.ts already uses for
// normalizeConceptKey, and src/utils/onboardingStatus.ts before it. What makes
// it safe is not discipline but a test: tests/unit/questionRevisionEquivalence
// runs BOTH implementations over the same matrix and fails on any drift.
//
// Node-safe by construction: no React, no Expo, no firebase-admin, no client
// Firebase, no platform persistence. Pure functions over plain data.

export const CHOICE_LABELS = ["A", "B", "C", "D", "E"] as const;
export type ChoiceLabel = (typeof CHOICE_LABELS)[number];

/** Mirrors MAX_QUESTION_DESCRIPTION_LENGTH in
 *  src/features/questions/services/questionRevision.ts, and the
 *  `description.size() <= 300` bound firestore.rules already enforces. */
export const MAX_QUESTION_DESCRIPTION_LENGTH = 300;
/** Mirrors MAX_QUESTION_HINTS / MAX_HINT_LENGTH in questionHints.ts. */
export const MAX_QUESTION_HINTS = 3;
export const MAX_HINT_LENGTH = 200;
/** Mirrors MAX_CHOICE_FEEDBACK_LENGTH / MAX_CONCEPT_KEY_LENGTH /
 *  MAX_SEMANTIC_DEFINITION_ID_LENGTH in choiceFeedback.ts, and
 *  MAX_SEMANTIC_LABEL_LENGTH in semanticDefinition.ts. */
export const MAX_CHOICE_FEEDBACK_LENGTH = 240;
export const MAX_CONCEPT_KEY_LENGTH = 48;
export const MAX_SEMANTIC_DEFINITION_ID_LENGTH = 64;
export const MAX_SEMANTIC_LABEL_LENGTH = 60;

export type QuestionChoices = Partial<Record<ChoiceLabel, string>>;

export interface ChoiceFeedbackEntry {
  text: string;
  semanticDefinitionId: string | null;
  semanticLabel: string | null;
  conceptKey: string | null;
}

export type QuestionChoiceFeedback = Partial<Record<ChoiceLabel, ChoiceFeedbackEntry>>;

/** Exactly the five fields a revision may write. Mirrors
 *  QuestionRevisionPayload. */
export interface QuestionAuthoringState {
  description: string | null;
  choices: QuestionChoices | null;
  correctChoice: ChoiceLabel | null;
  choiceFeedback: QuestionChoiceFeedback | null;
  hints: string[];
}

function isChoiceLabel(value: unknown): value is ChoiceLabel {
  return typeof value === "string" && (CHOICE_LABELS as readonly string[]).includes(value);
}

/** Mirrors sanitizeChoices in multipleChoice.ts. Fewer than two filled options
 *  means multiple choice was never really turned on. */
function sanitizeChoices(raw: unknown): QuestionChoices | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const trimmed: QuestionChoices = {};
  let filledCount = 0;
  for (const label of CHOICE_LABELS) {
    const value = record[label];
    if (typeof value !== "string") continue;
    const clean = value.trim();
    if (clean.length === 0) continue;
    trimmed[label] = clean;
    filledCount += 1;
  }
  return filledCount >= 2 ? trimmed : null;
}

/** Mirrors isValidCorrectChoice: a correct answer must name an option that is
 *  actually present and non-empty. */
function isValidCorrectChoice(choices: QuestionChoices | null, correctChoice: unknown): correctChoice is ChoiceLabel {
  if (!isChoiceLabel(correctChoice)) return false;
  if (!choices) return false;
  return Boolean(choices[correctChoice]?.trim());
}

/** Mirrors buildChoicesPayload. */
function buildChoicesPayload(
  rawChoices: unknown,
  rawCorrectChoice: unknown,
): { choices: QuestionChoices | null; correctChoice: ChoiceLabel | null } {
  const choices = sanitizeChoices(rawChoices);
  if (!choices) return { choices: null, correctChoice: null };
  return {
    choices,
    correctChoice: isValidCorrectChoice(choices, rawCorrectChoice) ? rawCorrectChoice : null,
  };
}

/** Mirrors sanitizeHints. Blanks are dropped so the ladder stays contiguous. */
export function sanitizeHints(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const cleaned: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length === 0) continue;
    cleaned.push(trimmed.slice(0, MAX_HINT_LENGTH));
    if (cleaned.length >= MAX_QUESTION_HINTS) break;
  }
  return cleaned;
}

/** Mirrors normalizeConceptKey. Formatting, never interpretation. */
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

/** Mirrors cleanDefinitionId. Opaque: accepted or rejected, never interpreted. */
function cleanDefinitionId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_SEMANTIC_DEFINITION_ID_LENGTH) return null;
  if (trimmed.includes("/")) return null;
  return trimmed;
}

function cleanLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, MAX_SEMANTIC_LABEL_LENGTH) : null;
}

/** Mirrors cleanEntry. A shared reference wins over a private key, so no entry
 *  can carry two competing identities. */
function cleanEntry(value: unknown): ChoiceFeedbackEntry | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const rawText = record.text;
  if (typeof rawText !== "string") return null;
  const text = rawText.trim();
  if (text.length === 0) return null;
  const semanticDefinitionId = cleanDefinitionId(record.semanticDefinitionId);
  const conceptKey = normalizeConceptKey(record.conceptKey);
  return {
    text: text.slice(0, MAX_CHOICE_FEEDBACK_LENGTH),
    semanticDefinitionId,
    semanticLabel: semanticDefinitionId ? cleanLabel(record.semanticLabel) : null,
    conceptKey: semanticDefinitionId ? null : conceptKey,
  };
}

/** Mirrors sanitizeChoiceFeedback. A note on the correct answer, or on an
 *  option that is not present, cannot survive — which is what makes changing
 *  the correct answer safe without a second, server-specific rule. */
export function sanitizeChoiceFeedback(
  raw: unknown,
  choices: QuestionChoices | null,
  correctChoice: ChoiceLabel | null,
): QuestionChoiceFeedback | null {
  if (!raw || typeof raw !== "object" || !choices) return null;
  const record = raw as Record<string, unknown>;
  const result: QuestionChoiceFeedback = {};
  let count = 0;
  for (const label of CHOICE_LABELS) {
    if (label === correctChoice) continue;
    if (!choices[label]?.trim()) continue;
    const entry = cleanEntry(record[label]);
    if (!entry) continue;
    result[label] = entry;
    count += 1;
  }
  return count > 0 ? result : null;
}

/** Mirrors sanitizeQuestionRevision. The one place a revision becomes the five
 *  fields that may be persisted. */
export function sanitizeQuestionAuthoringState(raw: {
  description?: unknown;
  choices?: unknown;
  correctChoice?: unknown;
  choiceFeedback?: unknown;
  hints?: unknown;
}): QuestionAuthoringState {
  const rawDescription = typeof raw.description === "string" ? raw.description.trim() : "";
  const { choices, correctChoice } = buildChoicesPayload(raw.choices, raw.correctChoice);
  return {
    description: rawDescription ? rawDescription.slice(0, MAX_QUESTION_DESCRIPTION_LENGTH) : null,
    choices,
    correctChoice,
    choiceFeedback: sanitizeChoiceFeedback(raw.choiceFeedback, choices, correctChoice),
    hints: sanitizeHints(raw.hints),
  };
}

/** The authoring projection of a stored question document.
 *
 *  Mirrors projectQuestionAuthoringState: it reads the five fields off the
 *  document and runs them back through the sanitiser, so a legacy or
 *  hand-edited document projects to what SAVING it would store. Everything
 *  else the document holds — ownerId, classId, visibility, posterRole, subject,
 *  topic, gradeLevel, imageUrl, createdAt and the three counters — is excluded,
 *  so a learner answering or a definition being renamed never reads as a
 *  competing edit. */
export function projectQuestionAuthoringState(data: Record<string, unknown>): QuestionAuthoringState {
  return sanitizeQuestionAuthoringState({
    description: data.description,
    choices: data.choices,
    correctChoice: data.correctChoice,
    choiceFeedback: data.choiceFeedback,
    hints: data.hints,
  });
}

/** Mirrors canonicalizeQuestionAuthoringState: sorted keys everywhere, array
 *  order preserved because hint order is meaningful. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) sorted[key] = canonicalize(record[key]);
    return sorted;
  }
  return value;
}

export function canonicalizeQuestionAuthoringState(state: QuestionAuthoringState): string {
  return JSON.stringify(canonicalize(state));
}

/** The optimistic-concurrency token, derived server-side from the database.
 *  A product token, never persisted and never a security claim. */
export function questionAuthoringRevision(data: Record<string, unknown>): string {
  return canonicalizeQuestionAuthoringState(projectQuestionAuthoringState(data));
}

export function hasQuestionRevisionConflict(expected: string, current: string): boolean {
  return expected !== current;
}

/** Every shared definition id a sanitised authoring state points at, deduped.
 *
 *  Bounded by construction: at most one per choice label, so at most five ids
 *  however large the payload is. Used to decide which definitions the server
 *  must read to validate a mapping — never an unbounded fan-out. */
export function referencedDefinitionIds(state: QuestionAuthoringState): string[] {
  const ids = new Set<string>();
  const feedback = state.choiceFeedback;
  if (!feedback) return [];
  for (const label of CHOICE_LABELS) {
    const id = feedback[label]?.semanticDefinitionId;
    if (id) ids.add(id);
  }
  return [...ids];
}

/** The definition ids that are NEW in this revision — present in the next
 *  state and absent from the current one.
 *
 *  This is the distinction that lets an archived definition keep working
 *  exactly where it already is while being refused as a new target: only new
 *  references are held to the "must be active" bar. */
export function newlyReferencedDefinitionIds(
  current: QuestionAuthoringState,
  next: QuestionAuthoringState,
): string[] {
  const before = new Set(referencedDefinitionIds(current));
  return referencedDefinitionIds(next).filter((id) => !before.has(id));
}
