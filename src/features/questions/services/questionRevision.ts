import {
  CHOICE_LABELS,
  ChoiceLabel,
  Question,
  QuestionChoiceFeedback,
  QuestionChoices,
} from "@/types/question";

import { sanitizeChoiceFeedback } from "./choiceFeedback";
import { buildChoicesPayload, hasMultipleChoice } from "./multipleChoice";
import { MAX_QUESTION_HINTS, sanitizeHints } from "./questionHints";

// Phase 86 — revising a question the current user authored.
//
// WHAT A REVISION IS
//
// A change to the CURRENT authoring state of one question: its caption, its
// options, which option is correct, the author's note on each wrong option
// (and the shared meaning that note points at), and its hints. Nothing else.
//
// WHAT A REVISION IS NOT
//
// Not a new version in a history — the app stores none, and this module
// fabricates none. Not a rewrite of anything a learner already did: every
// studyEvent that exists today was recorded against the meaning the question
// carried at the time, and it stays exactly as recorded. A revision is
// FUTURE-FACING. The next learner meets the revised question; the last one's
// evidence is untouched.
//
// So this file deliberately cannot express the fields a revision must never
// touch. `QuestionRevisionDraft` has no ownerId, classId, visibility,
// posterRole, subject, topic, gradeLevel, imageUrl, createdAt or counter —
// there is no way to put one in the payload, which is a stronger guarantee
// than a rule that strips them out.
//
// ONE SANITISER, NOT TWO
//
// The write path below is the create path's, byte for byte in intent:
// buildChoicesPayload decides what counts as a real option set and a legal
// correct answer, sanitizeChoiceFeedback drops a note that names an absent
// option or the correct one, sanitizeHints bounds the ladder. A revision that
// makes option B the correct answer therefore loses B's wrong-answer note and
// its semantic mapping BY THE SAME RULE the composer would apply — not by a
// second, Phase-86-specific opinion that could drift from it.

/** One wrong option's authored note, as the editor holds it. */
export interface ChoiceFeedbackDraft {
  text: string;
  /** Phase 80 — the shared definition this note points at, or null. */
  semanticDefinitionId: string | null;
  /** Display snapshot of that definition's label at authoring time, or null. */
  semanticLabel: string | null;
  /** Phase 78 — a legacy private key. Preserved when present so an old
   *  mapping is not silently lost; never offered as a new input. */
  conceptKey: string | null;
}

/** Everything the editor may change, and nothing it may not. */
export interface QuestionRevisionDraft {
  /** The caption. `null` when the author wants none. */
  description: string | null;
  /** Label-keyed, exactly as the document stores them. A blank string is an
   *  absent option. */
  choices: Partial<Record<ChoiceLabel, string>>;
  correctChoice: ChoiceLabel | null;
  feedback: Partial<Record<ChoiceLabel, ChoiceFeedbackDraft>>;
  hints: string[];
}

/** The sanitized result — exactly the five fields updateQuestion writes. */
export interface QuestionRevisionPayload {
  description: string | null;
  choices: QuestionChoices | null;
  correctChoice: ChoiceLabel | null;
  choiceFeedback: QuestionChoiceFeedback | null;
  hints: string[];
}

/** Mirrors the composer and firestore.rules (`description.size() <= 300`). */
export const MAX_QUESTION_DESCRIPTION_LENGTH = 300;

/** The editor's starting state: the question exactly as it is now.
 *
 *  Every present option and every present note is carried over, including a
 *  note that points at an archived definition and a note that still carries a
 *  private conceptKey — neither is dropped or migrated by opening the editor.
 *  Opening changes nothing; only an explicit save does. */
export function createQuestionRevisionDraft(question: Question): QuestionRevisionDraft {
  const choices: Partial<Record<ChoiceLabel, string>> = {};
  const feedback: Partial<Record<ChoiceLabel, ChoiceFeedbackDraft>> = {};
  for (const label of CHOICE_LABELS) {
    const text = question.choices?.[label];
    if (typeof text === "string" && text.trim()) choices[label] = text;
    const entry = question.choiceFeedback?.[label];
    if (entry) {
      feedback[label] = {
        text: entry.text,
        semanticDefinitionId: entry.semanticDefinitionId ?? null,
        semanticLabel: entry.semanticLabel ?? null,
        conceptKey: entry.conceptKey ?? null,
      };
    }
  }
  return {
    description: question.description ?? null,
    choices,
    correctChoice: question.correctChoice ?? null,
    feedback,
    hints: [...question.hints],
  };
}

/** Whether a draft still describes a multiple-choice question.
 *
 *  Decided from the draft's own options — the same test the rest of the
 *  product applies — so a question whose author blanks every option becomes a
 *  plain question, with its correct answer and every note going with it. */
export function draftHasChoices(draft: QuestionRevisionDraft): boolean {
  return CHOICE_LABELS.some((label) => Boolean(draft.choices[label]?.trim()));
}

/** The first reason a draft cannot be saved, or null when it can.
 *
 *  The same two rules the composer enforces, stated once: two real options
 *  make a multiple-choice question, and a multiple-choice question must name a
 *  correct answer that is actually one of them. */
export function validateQuestionRevision(draft: QuestionRevisionDraft): string | null {
  if (draft.description && draft.description.length > MAX_QUESTION_DESCRIPTION_LENGTH) {
    return `Soru metni en fazla ${MAX_QUESTION_DESCRIPTION_LENGTH} karakter olabilir.`;
  }
  if (!draftHasChoices(draft)) return null;
  const payload = buildChoicesPayload(draft.choices, draft.correctChoice);
  if (!payload.choices) return "Çoktan seçmeli için en az 2 şık doldurmalısınız.";
  if (!payload.correctChoice) return "Lütfen doğru cevabı seçin.";
  return null;
}

/** Draft → the exact fields to persist, through the canonical sanitisers.
 *
 *  Order matters and is the whole safety argument:
 *   1. the options settle first (blanks dropped; fewer than two → no options);
 *   2. the correct answer is validated against THOSE options;
 *   3. every note is validated against both — a note on an absent option is
 *      dropped, a note on the correct option is dropped, a blank note is
 *      dropped, a shared reference and a private key never coexist;
 *   4. hints are trimmed, blanks dropped, and bounded.
 *
 *  Pure and deterministic: the same draft always yields the same payload, and
 *  nothing here reads a clock or mutates its input. */
export function sanitizeQuestionRevision(draft: QuestionRevisionDraft): QuestionRevisionPayload {
  const description = draft.description?.trim() ? draft.description.trim() : null;
  const { choices, correctChoice } = buildChoicesPayload(draft.choices, draft.correctChoice);

  const rawFeedback: Partial<Record<ChoiceLabel, unknown>> = {};
  for (const label of CHOICE_LABELS) {
    const entry = draft.feedback[label];
    if (!entry) continue;
    rawFeedback[label] = {
      text: entry.text,
      semanticDefinitionId: entry.semanticDefinitionId,
      semanticLabel: entry.semanticLabel,
      conceptKey: entry.conceptKey,
    };
  }

  return {
    description: description ? description.slice(0, MAX_QUESTION_DESCRIPTION_LENGTH) : null,
    choices,
    correctChoice,
    choiceFeedback: sanitizeChoiceFeedback(rawFeedback, choices, correctChoice),
    hints: sanitizeHints(draft.hints),
  };
}

/** Phase 87 — the MUTABLE AUTHORING PROJECTION: the question reduced to exactly
 *  the five fields `updateQuestion` is allowed to write, in canonical form.
 *
 *  Deliberately routed through the same draft-then-sanitise path a real edit
 *  takes, rather than reading the five raw document fields. Two questions that
 *  would persist identically therefore project identically, and a document that
 *  happens to hold an un-sanitised legacy shape projects to what saving it
 *  would actually store — which is the only comparison a concurrency check can
 *  honestly make.
 *
 *  Everything else about the document is excluded ON PURPOSE: ownerId, classId,
 *  visibility, posterRole, subject, topic, gradeLevel, imageUrl, createdAt and
 *  the three engagement counters. None of them is editable here, so a change to
 *  one must never look like a competing edit. */
export function projectQuestionAuthoringState(question: Question): QuestionRevisionPayload {
  return sanitizeQuestionRevision(createQuestionRevisionDraft(question));
}

/** A deterministic, key-order-independent rendering of the authoring
 *  projection.
 *
 *  Object key order is not part of a question's meaning, and Firestore makes no
 *  promise about it, so a naive JSON.stringify could report a conflict between
 *  two byte-identical questions. Every object is emitted with sorted keys and
 *  arrays keep their own order, which IS meaningful for hints. */
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

export function canonicalizeQuestionAuthoringState(payload: QuestionRevisionPayload): string {
  return JSON.stringify(canonicalize(payload));
}

/** Phase 87 — the optimistic-concurrency token for one question's authoring
 *  state.
 *
 *  A PRODUCT token, not a security one: it exists so a stale editor cannot
 *  silently overwrite a newer save, and it makes no cryptographic claim. It is
 *  never persisted, never migrated, never shown to a teacher, and carries no
 *  authority — firestore.rules remain the only thing deciding who may write. */
export function questionAuthoringRevision(question: Question): string {
  return canonicalizeQuestionAuthoringState(projectQuestionAuthoringState(question));
}

/** Whether the authoring state moved under a stale editor. */
export function hasQuestionRevisionConflict(expected: string, current: string): boolean {
  return expected !== current;
}

/** Whether saving `draft` would change anything about `question`.
 *
 *  Compared on the SANITISED payload, not the raw draft, so trailing
 *  whitespace, a blank hint box or a note on an option that was never filled
 *  in do not count as edits — they would not reach the document either. */
export function isRevisionDirty(question: Question, draft: QuestionRevisionDraft): boolean {
  const next = canonicalizeQuestionAuthoringState(sanitizeQuestionRevision(draft));
  const current = canonicalizeQuestionAuthoringState(projectQuestionAuthoringState(question));
  return next !== current;
}

/** Which options may carry a note: the present ones that are not the correct
 *  answer. The editor renders a note field for exactly these, so the form
 *  cannot even show a field the sanitiser would discard. */
export function feedbackEligibleLabels(draft: QuestionRevisionDraft): ChoiceLabel[] {
  if (!hasMultipleChoice(draft.choices as QuestionChoices)) return [];
  return CHOICE_LABELS.filter(
    (label) => Boolean(draft.choices[label]?.trim()) && label !== draft.correctChoice,
  );
}

/** Hint boxes to render: the current hints padded to the ladder's length. */
export function hintDraftBoxes(hints: readonly string[]): string[] {
  const boxes = [...hints].slice(0, MAX_QUESTION_HINTS);
  while (boxes.length < MAX_QUESTION_HINTS) boxes.push("");
  return boxes;
}

/** The exact fields updateQuestion writes, and only those.
 *
 *  Kept pure and beside the sanitiser so the allowlist is unit-testable
 *  without Firestore: a test can assert that no revision, however constructed,
 *  ever yields a key outside this set. The service does nothing but hand this
 *  object to updateDoc. */
export const QUESTION_UPDATE_ALLOWLIST = [
  "description",
  "choices",
  "correctChoice",
  "choiceFeedback",
  "hints",
] as const;

export interface QuestionUpdatePatch {
  description: string | null;
  choices: QuestionChoices | null;
  correctChoice: ChoiceLabel | null;
  choiceFeedback: QuestionChoiceFeedback | null;
  hints: string[];
}

export function buildQuestionUpdatePatch(payload: QuestionRevisionPayload): QuestionUpdatePatch {
  return {
    description: payload.description,
    choices: payload.choices,
    correctChoice: payload.correctChoice,
    choiceFeedback: payload.choiceFeedback,
    hints: payload.hints,
  };
}

// Teacher-facing wording.

/** Said on the editor, once, before any field: the one promise this feature
 *  makes and the one it refuses to make. */
export const REVISION_TRUST_NOTE =
  "Bu düzenleme yeni yanıtlar için geçerlidir. Önceki öğrenme kayıtları değişmez.";

/** Phase 87 — what a teacher reads when their draft has been overtaken.
 *
 *  A synchronisation fact, said without blame and without jargon: no status
 *  code, no "conflict" as a technical term, no mention of transactions or
 *  fingerprints. It says what happened, what was prevented, and what to do. */
export const CONFLICT_TITLE = "Bu soru başka bir oturumda güncellendi";

export const CONFLICT_BODY =
  "Değişikliklerinin daha yeni içeriğin üzerine yazılmasını önledik. Buradaki taslağın duruyor; devam etmek için güncel sürümü yükle.";

/** Added when the shared meaning behind an option was changed or removed. */
export const REMAP_TRUST_NOTE =
  "Yeni yanıtlar güncel eşlemeyi kullanır. Eski kayıtlar o günkü eşlemeyle kalır.";

/** Whether the draft changes any option's shared semantic mapping. */
export function isSemanticMappingChanged(question: Question, draft: QuestionRevisionDraft): boolean {
  const before = sanitizeQuestionRevision(createQuestionRevisionDraft(question)).choiceFeedback;
  const after = sanitizeQuestionRevision(draft).choiceFeedback;
  for (const label of CHOICE_LABELS) {
    const a = before?.[label]?.semanticDefinitionId ?? null;
    const b = after?.[label]?.semanticDefinitionId ?? null;
    if (a !== b) return true;
  }
  return false;
}
