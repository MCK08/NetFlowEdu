// Phase 78 — turning an authored distractor meaning into VERIFIED evidence.
//
// WHAT THIS DECIDES
//
// Given the question document this transaction already read, and the option
// the client says the student picked, does that pick carry an authored
// semantic meaning worth remembering across questions? Almost always the
// answer is no, and no is returned as null rather than as a guess.
//
// WHY IT LIVES HERE AND NOT IN src/
//
// Cloud Functions is a separate TypeScript project with its own tsconfig,
// build and runtime; the Expo app cannot be imported across that boundary.
// The repository's established answer is a deliberate, documented mirror —
// see src/utils/onboardingStatus.ts, which mirrors
// functions/src/onboarding/onboardingStatus.ts and says so. This module is
// the same arrangement in the other direction: it re-states the narrow slice
// of Phase 77's choiceFeedback.ts that the server must be able to decide for
// itself, and tests/unit/semanticChoiceEvidence.test.ts pins the two against
// the same inputs so they cannot drift.
//
// WHY THE SERVER DECIDES AT ALL
//
// Because the client must not be able to claim meaning. A caller can say
// "I picked B"; it can never say "B means sign_transfer_error", who authored
// that, or whether B was even wrong. All three are read from the question
// document inside the same transaction that records the outcome.
//
// WHAT THE EVIDENCE PROVES, AND WHAT IT DOES NOT
//
// It proves: at this moment, this student selected an option whose author had
// attached this machine-readable meaning. It does NOT prove why the student
// thought so, that they hold a durable misconception, or that they do not
// understand the concept. Nothing downstream may upgrade it to any of those.

// The five labels a choice may carry. Mirrors CHOICE_LABELS in
// src/types/question.ts.
const CHOICE_LABELS = ["A", "B", "C", "D", "E"] as const;

export type ChoiceLabel = (typeof CHOICE_LABELS)[number];

export function isChoiceLabel(value: unknown): value is ChoiceLabel {
  return typeof value === "string" && (CHOICE_LABELS as readonly string[]).includes(value);
}

// Mirrors MAX_CONCEPT_KEY_LENGTH in src/features/questions/services/choiceFeedback.ts.
export const MAX_CONCEPT_KEY_LENGTH = 48;

export const SEMANTIC_CHOICE_SCHEMA_VERSION = 1;

/** Mirrors normalizeConceptKey in choiceFeedback.ts, byte for byte in intent.
 *
 *  Re-run on the server rather than trusting the stored string: the write path
 *  normalises, but a hand-edited or migrated document can hold anything, and
 *  an un-normalised key would silently split one authored meaning into two
 *  identities that never group. */
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

/** What one confirmed outcome records about the option the student picked.
 *
 *  Deliberately tiny. It carries no feedback text, no option text, no question
 *  content and no subject/topic — the event it rides in refuses all of those
 *  on purpose (see learningEvent.ts's own note on why snapshotting question
 *  content into a document the student keeps forever is unsafe). Subject and
 *  topic are joined on the client from the shared question-metadata cache, the
 *  same way Phase 59's trail already resolves them. */
export interface SemanticChoiceEvidence {
  /** The question author's uid — the namespace this conceptKey belongs to.
   *
   *  Server-authoritative twice over: firestore.rules pins `ownerId == uid()`
   *  at create and forbids changing it on update, and this value is read from
   *  the question document rather than accepted from the caller.
   *
   *  It is REQUIRED because a conceptKey is not a global taxonomy term. Two
   *  authors may both write "sign_transfer_error" meaning different things,
   *  and merging them would be the product inventing a shared vocabulary that
   *  nobody agreed to. */
  namespaceId: string;
  /** The author's own machine-readable name for what this option represents.
   *  Never shown to a learner. */
  conceptKey: string;
  /** Which option was picked. Kept so a later reader can tell two occurrences
   *  apart within one question without re-reading the question. */
  choiceLabel: ChoiceLabel;
  schemaVersion: number;
}

/** The fields of a question document this resolver reads. Structural so the
 *  caller can pass a raw Firestore payload without a cast. */
export interface SemanticQuestionSource {
  ownerId?: unknown;
  choices?: unknown;
  correctChoice?: unknown;
  choiceFeedback?: unknown;
}

function optionText(choices: unknown, label: ChoiceLabel): string | null {
  if (!choices || typeof choices !== "object" || Array.isArray(choices)) return null;
  const value = (choices as Record<string, unknown>)[label];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Verified semantic evidence for this pick, or null.
 *
 *  Every gate below is a reason to record NOTHING, and each one exists because
 *  recording anyway would assert something untrue:
 *
 *   · no pick at all, or a label that is not one of the five  — nothing happened
 *   · the label names no real option on this question         — the pick is not real
 *   · the pick IS the correct answer                          — Phase 77 is wrong-answer
 *                                                               guidance; a correct pick
 *                                                               carries no distractor meaning
 *   · the author attached no feedback to that option          — nothing authored to record
 *   · the author attached feedback but no conceptKey          — a sentence for a human, not
 *                                                               an identity to group by
 *   · the question has no usable ownerId                      — no namespace, and a key
 *                                                               without one is not an identity
 *
 *  Note the deliberate omission: nothing is ever re-pointed at a neighbouring
 *  option to rescue an unusable pick, exactly as resolveChoiceFeedback refuses
 *  to. A misattributed meaning is far worse than a missing one. */
export function resolveSemanticChoiceEvidence(params: {
  question: SemanticQuestionSource;
  selectedChoice: unknown;
}): SemanticChoiceEvidence | null {
  const { question, selectedChoice } = params;

  if (!isChoiceLabel(selectedChoice)) return null;
  if (!optionText(question.choices, selectedChoice)) return null;

  // A correct pick is excluded, and so is a question whose correctChoice is
  // missing or malformed: without knowing which option is right, "this was a
  // wrong answer" is not something the server can verify, and Phase 78 records
  // only what it can verify.
  if (!isChoiceLabel(question.correctChoice)) return null;
  if (selectedChoice === question.correctChoice) return null;

  const feedback = question.choiceFeedback;
  if (!feedback || typeof feedback !== "object" || Array.isArray(feedback)) return null;
  const entry = (feedback as Record<string, unknown>)[selectedChoice];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;

  // The authored sentence must actually exist. An entry carrying a key but no
  // text is not authored feedback — it is a fragment, and Phase 77's own
  // sanitiser drops it for the same reason.
  const text = (entry as Record<string, unknown>).text;
  if (typeof text !== "string" || text.trim().length === 0) return null;

  const conceptKey = normalizeConceptKey((entry as Record<string, unknown>).conceptKey);
  if (!conceptKey) return null;

  const namespaceId = typeof question.ownerId === "string" ? question.ownerId.trim() : "";
  if (namespaceId.length === 0) return null;

  return {
    namespaceId,
    conceptKey,
    choiceLabel: selectedChoice,
    schemaVersion: SEMANTIC_CHOICE_SCHEMA_VERSION,
  };
}
