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

/** Phase 80 — WHOSE vocabulary a semantic id belongs to.
 *
 *  This discriminator is not decoration. Before it, a namespace was a bare
 *  string that happened to hold a user uid; adding class-scoped sharing means
 *  it may now hold a class id instead, and nothing about the two id spaces
 *  guarantees they can never collide. Comparing (kind, id) rather than id
 *  alone makes that impossible by construction rather than by luck.
 *
 *   · "author" — one person's private vocabulary. A conceptKey they typed.
 *     Two authors writing the same word still mean two different things.
 *   · "class"  — a shared vocabulary. The semantic id is an opaque definition
 *     id that authors EXPLICITLY selected, which is the only basis on which
 *     two different authors may be said to mean the same thing. */
export type SemanticNamespaceKind = "author" | "class";

/** One semantic meaning, fully qualified. */
export interface SemanticIdentity {
  namespaceKind: SemanticNamespaceKind;
  namespaceId: string;
  /** conceptKey for "author", definition id for "class". */
  semanticId: string;
}

/** A definition label is bounded before it is ever written into an event.
 *  Mirrors MAX_SEMANTIC_LABEL_LENGTH in
 *  src/features/questions/services/semanticDefinition.ts. */
export const MAX_SEMANTIC_LABEL_LENGTH = 60;

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
  /** Phase 80 — whose vocabulary `conceptKey` belongs to.
   *
   *  Optional in the STORED shape purely for backward compatibility: every
   *  Phase 78/79 event predates this field, and absent means "author", which
   *  is exactly what those events were. A reader must never treat a missing
   *  kind as shared. */
  namespaceKind?: SemanticNamespaceKind;
  /** The identity within that namespace: a typed conceptKey for an author
   *  vocabulary, an opaque definition id for a shared one. The field keeps its
   *  Phase 78 name so no existing reader breaks. Never shown to a learner. */
  conceptKey: string;
  /** Phase 80 — the shared definition's human label at the moment this outcome
   *  was recorded, for shared identities only.
   *
   *  Display only, never identity, and deliberately a snapshot: a later rename
   *  does not rewrite what a student was shown. Absent for author-scoped
   *  identities, which have no label an author ever wrote for a reader. */
  label?: string;
  /** Which option was picked. Kept so a later reader can tell two occurrences
   *  apart within one question without re-reading the question. */
  choiceLabel: ChoiceLabel;
  schemaVersion: number;
}

/** Phase 79 — which authored semantic distractors were ON THE PAGE when the
 *  student answered.
 *
 *  WHY THIS EXISTS
 *
 *  Phase 78 could record that a meaning was SELECTED. It could never record
 *  that a meaning was AVAILABLE and passed over, so "the student has not
 *  picked X lately" was ambiguous between two completely different facts:
 *  they saw X and chose otherwise, or X was simply never in front of them
 *  again. Without this payload the second is indistinguishable from the
 *  first, and any recovery claim built on that silence would be a guess.
 *
 *  WHY IT REQUIRES A SELECTION
 *
 *  `selectedChoice` is not decoration here — it is what makes the whole
 *  payload meaningful. A student can record an outcome on a multiple-choice
 *  question WITHOUT touching the options (the rating control does exactly
 *  that), and in that case the distractors were technically present but were
 *  never offered as a decision. Counting it would turn "did not engage" into
 *  "declined", which is precisely the fabrication this phase exists to
 *  prevent. So opportunities are recorded only alongside a real pick.
 *
 *  WHY namespaceId IS HOISTED
 *
 *  Every option on one question belongs to one author, because `ownerId` is a
 *  property of the question. Repeating it per entry would store the same
 *  string up to four times and imply, wrongly, that entries could differ. */
export interface SemanticOpportunityEvidence {
  /** The question author's uid. Same namespace rule as SemanticChoiceEvidence:
   *  a conceptKey means nothing without the author it belongs to. */
  /** LEGACY, and written no longer. Phase 79 assumed every meaning on one
   *  question shared one namespace, which stopped being true the moment a
   *  question could mix a private conceptKey on one option with a shared
   *  definition on another. Kept on the type so old documents still describe
   *  themselves; new writes populate `items` instead. */
  namespaceId?: string;
  /** LEGACY companion to `namespaceId`. See above. */
  conceptKeys?: string[];
  /** Phase 80 — every distinct meaning that was selectable and wrong, each
   *  carrying its OWN namespace.
   *
   *  This is the fix for the mixed-namespace question: choice A may be a
   *  private conceptKey and choice C a shared definition, and both are now
   *  representable without either being forced into the other's vocabulary.
   *
   *  Deduplicated by full identity and sorted, so the stored bytes are
   *  deterministic and one meaning offered on two options counts once. */
  items?: SemanticIdentity[];
  /** The option the student actually picked. Proves a decision was made, and
   *  lets a reader tell "chose something else" from "chose this one" without
   *  re-reading the question. */
  selectedChoice: ChoiceLabel;
  schemaVersion: number;
}

/** The fields of a question document this resolver reads. Structural so the
 *  caller can pass a raw Firestore payload without a cast. */
export interface SemanticQuestionSource {
  ownerId?: unknown;
  /** Phase 80 — the class this question lives in, and therefore the ONLY
   *  shared vocabulary its entries may resolve against.
   *
   *  Scope is taken from the QUESTION, never from the reference. That single
   *  choice is what makes cross-class contamination structurally impossible:
   *  a stale or forged definition id on a class-B question resolves to
   *  ("class", B, id) and can only ever group with other class-B questions.
   *  It can never reach into class A's meaning, no matter what it points at,
   *  and no extra read is needed to guarantee that. */
  classId?: unknown;
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

/** The fully-qualified meaning attached to ONE option, or null.
 *
 *  The order of the two branches is the whole contract. A shared reference is
 *  an explicit act — the author picked a definition from their class's own
 *  vocabulary — so it takes precedence, and the sanitiser has already dropped
 *  any private key on the same entry so the two can never compete. Only an
 *  entry with no reference falls back to Phase 78's author-scoped key.
 *
 *  Scope for a shared identity comes from the QUESTION's classId, never from
 *  the referenced definition. See SemanticQuestionSource.classId for why that
 *  makes cross-class contamination impossible without a verification read. */
function identityForOption(
  question: SemanticQuestionSource,
  label: ChoiceLabel,
): { identity: SemanticIdentity; label: string | null } | null {
  const entry = feedbackEntry(question, label);
  if (!entry) return null;

  const definitionId = readDefinitionId(entry.semanticDefinitionId);
  if (definitionId) {
    const classId = typeof question.classId === "string" ? question.classId.trim() : "";
    // A shared reference outside a class has no vocabulary to belong to. It is
    // dropped rather than quietly downgraded to the author's private
    // namespace, which would silently change what the author selected into
    // something they did not.
    if (!classId) return null;
    return {
      identity: { namespaceKind: "class", namespaceId: classId, semanticId: definitionId },
      label: readLabel(entry.semanticLabel),
    };
  }

  const conceptKey = normalizeConceptKey(entry.conceptKey);
  if (!conceptKey) return null;
  const namespaceId = typeof question.ownerId === "string" ? question.ownerId.trim() : "";
  if (!namespaceId) return null;
  return {
    identity: { namespaceKind: "author", namespaceId, semanticId: conceptKey },
    // An author-scoped key is internal vocabulary with no reader-facing label,
    // and inventing prose from the slug is exactly what Phase 78 refused.
    label: null,
  };
}

/** The authored feedback entry for one option, after every Phase 77 gate that
 *  makes it a real, wrong, explained option. Shared by both resolvers so the
 *  "was offered" and "was chosen" paths can never disagree about what counts. */
function feedbackEntry(
  question: SemanticQuestionSource,
  label: ChoiceLabel,
): Record<string, unknown> | null {
  if (!optionText(question.choices, label)) return null;
  if (!isChoiceLabel(question.correctChoice)) return null;
  if (label === question.correctChoice) return null;

  const feedback = question.choiceFeedback;
  if (!feedback || typeof feedback !== "object" || Array.isArray(feedback)) return null;
  const entry = (feedback as Record<string, unknown>)[label];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;

  const text = (entry as Record<string, unknown>).text;
  if (typeof text !== "string" || text.trim().length === 0) return null;
  return entry as Record<string, unknown>;
}

/** Opaque in, opaque out. Never parsed, never interpreted. */
function readDefinitionId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 64 || trimmed.includes("/")) return null;
  return trimmed;
}

function readLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, MAX_SEMANTIC_LABEL_LENGTH) : null;
}

/** Stable ordering key for an identity. Kind first so the two vocabularies
 *  never interleave, then namespace, then the id itself. */
function identityKey(identity: SemanticIdentity): string {
  return `${identity.namespaceKind}\u0000${identity.namespaceId}\u0000${identity.semanticId}`;
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

  const resolved = identityForOption(question, selectedChoice);
  if (!resolved) return null;

  return {
    namespaceKind: resolved.identity.namespaceKind,
    namespaceId: resolved.identity.namespaceId,
    conceptKey: resolved.identity.semanticId,
    choiceLabel: selectedChoice,
    // Spread only when there is one: an author-scoped identity has no
    // reader-facing label, and writing an empty string would make the UI think
    // it had something to show.
    ...(resolved.label ? { label: resolved.label } : {}),
    schemaVersion: SEMANTIC_CHOICE_SCHEMA_VERSION,
  };
}

/** At most four wrong options can exist alongside one correct answer, so this
 *  is the natural ceiling rather than an invented one. Enforced explicitly all
 *  the same: an array written to a document a student keeps forever should
 *  have a stated bound, not an implied one. */
export const MAX_SEMANTIC_OPPORTUNITIES = CHOICE_LABELS.length - 1;

/** Every authored semantic distractor that was selectable on this question at
 *  the moment it was answered, or null when there were none.
 *
 *  Returns null — not an empty array — when nothing qualifies, so an ordinary
 *  outcome never carries a field that means nothing to it.
 *
 *  Deduplicated by conceptKey: if an author attached the same meaning to two
 *  different wrong options, the student was offered that meaning ONCE, not
 *  twice. Counting it twice would inflate every later decline.
 *
 *  Sorted, so the same question always produces the same stored bytes and a
 *  diff of two events is about what changed, not about map iteration order. */
export function resolveSemanticOpportunities(params: {
  question: SemanticQuestionSource;
  selectedChoice: unknown;
}): SemanticOpportunityEvidence | null {
  const { question, selectedChoice } = params;

  // No pick, no opportunity — see the interface note. This is the gate that
  // keeps a rating-only outcome on a multiple-choice question from ever
  // looking like a declined distractor.
  if (!isChoiceLabel(selectedChoice)) return null;
  if (!optionText(question.choices, selectedChoice)) return null;

  const byKey = new Map<string, SemanticIdentity>();
  for (const label of CHOICE_LABELS) {
    const resolved = identityForOption(question, label);
    if (!resolved) continue;
    // Deduplicated by FULL identity: one meaning offered on two options was
    // offered once, and counting it twice would inflate every later decline.
    byKey.set(identityKey(resolved.identity), resolved.identity);
  }
  if (byKey.size === 0) return null;

  const items = [...byKey.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, identity]) => identity)
    .slice(0, MAX_SEMANTIC_OPPORTUNITIES);

  return {
    items,
    selectedChoice,
    schemaVersion: SEMANTIC_CHOICE_SCHEMA_VERSION,
  };
}
