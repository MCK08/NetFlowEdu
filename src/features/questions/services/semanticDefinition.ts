// Phase 80 — a shared, explicitly-referenced instructional label.
//
// THE PROBLEM THIS SOLVES
//
// Phase 77 let an author name what a wrong option represents; Phases 78-79
// made that name durable evidence. But the name is a free-text `conceptKey`
// typed per question, so it only ever groups when the same person happens to
// type the same slug twice — and it can NEVER group across authors, because
// two people writing "sign_transfer_error" may mean different things and the
// product has no way to know.
//
// THE ONLY SAFE FIX
//
// Not string matching, not slug normalisation, not similarity, not a model.
// Two questions share a meaning when their authors both POINT AT THE SAME
// canonical definition — an explicit act, recorded as an opaque id. Everything
// else in this file exists to make that act convenient and to stop the id from
// meaning anything on its own.
//
// WHAT IT IS NOT
//
// Not a misconception database and not an error taxonomy. A definition names
// what an AUTHOR says a distractor represents — an instructional label for
// teachers to reuse. It says nothing about any student's mind, and nothing
// downstream may upgrade it into a diagnosis.

/** Bounded so a label stays a label. Long enough for a real Turkish phrase
 *  ("Eşitlikte işaret aktarımı"), short enough that it cannot become a
 *  paragraph pretending to be an identity. */
export const MAX_SEMANTIC_LABEL_LENGTH = 60;

/** A note for OTHER TEACHERS deciding whether this is the label they mean.
 *  Never shown to a student. */
export const MAX_SEMANTIC_DESCRIPTION_LENGTH = 200;

export const SEMANTIC_DEFINITION_SCHEMA_VERSION = 1;

/** How many definitions one class's vocabulary may hold in a single read.
 *  A class's instructional vocabulary is a curated list, not a dataset; if a
 *  class ever needs more than this, the right answer is a narrower vocabulary,
 *  not a bigger query. */
export const MAX_CLASS_SEMANTIC_DEFINITIONS = 200;

export interface SemanticDefinition {
  /** Opaque, stable, and deliberately meaningless: the Firestore document id.
   *
   *  Identity is the id and ONLY the id. Not the label, not a slug of the
   *  label, not the subject/topic pair. That is the whole point — two
   *  definitions may carry identical labels and remain different meanings,
   *  and renaming one changes nothing about what it identifies. */
  id: string;
  /** The class this vocabulary belongs to. Sharing is scoped to it. */
  classId: string;
  /** Author-written, human-readable. Display only. */
  label: string;
  /** Optional note for other authors. Never rendered to a learner. */
  description: string | null;
  /** Phase 70's conservative learning scope, trim-only. Immutable after
   *  creation: a definition that could change subject or topic would silently
   *  re-scope every historical grouping that referenced it. */
  subject: string;
  topic: string;
  /** The teacher who created it. Immutable. */
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  /** Retired from new selection, but still valid everywhere it is already
   *  referenced. Definitions are never hard-deleted — questions and events
   *  point at them, and deletion would leave those pointing at nothing. */
  archived: boolean;
  schemaVersion: number;
}

/** What a teacher types when creating one. Subject and topic are inherited
 *  from the question being authored rather than retyped, so a definition
 *  cannot drift out of the scope it was created in. */
export interface SemanticDefinitionInput {
  label: string;
  description?: string | null;
  subject: string;
  topic: string;
}

export interface SanitizedSemanticDefinition {
  label: string;
  description: string | null;
  subject: string;
  topic: string;
}

/** Author input -> what is worth persisting, or null when it is not usable.
 *
 *  Trim-and-cap only. Nothing here interprets, expands, translates or
 *  normalises meaning — a label is the author's words, and the only thing
 *  this does is refuse an empty one and stop an overlong one. */
export function sanitizeSemanticDefinition(
  input: SemanticDefinitionInput | null | undefined,
): SanitizedSemanticDefinition | null {
  if (!input) return null;
  const label = typeof input.label === "string" ? input.label.trim() : "";
  if (label.length === 0) return null;

  const subject = typeof input.subject === "string" ? input.subject.trim() : "";
  const topic = typeof input.topic === "string" ? input.topic.trim() : "";
  // A definition without a scope would be a claim about every subject at once.
  if (!subject || !topic) return null;

  const rawDescription = typeof input.description === "string" ? input.description.trim() : "";
  return {
    label: label.slice(0, MAX_SEMANTIC_LABEL_LENGTH),
    description:
      rawDescription.length > 0
        ? rawDescription.slice(0, MAX_SEMANTIC_DESCRIPTION_LENGTH)
        : null,
    subject,
    topic,
  };
}

/** The READ half — whatever a Firestore document actually holds.
 *
 *  Returns null rather than a partially-filled definition: a definition
 *  missing its scope or its label cannot be safely offered for reuse, and
 *  half of one is worse than none. */
export function parseSemanticDefinition(id: string, value: unknown): SemanticDefinition | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;

  const classId = typeof record.classId === "string" ? record.classId.trim() : "";
  const label = typeof record.label === "string" ? record.label.trim() : "";
  const subject = typeof record.subject === "string" ? record.subject.trim() : "";
  const topic = typeof record.topic === "string" ? record.topic.trim() : "";
  const createdBy = typeof record.createdBy === "string" ? record.createdBy.trim() : "";
  if (!id || !classId || !label || !subject || !topic || !createdBy) return null;

  const description =
    typeof record.description === "string" && record.description.trim().length > 0
      ? record.description.trim().slice(0, MAX_SEMANTIC_DESCRIPTION_LENGTH)
      : null;

  return {
    id,
    classId,
    label: label.slice(0, MAX_SEMANTIC_LABEL_LENGTH),
    description,
    subject,
    topic,
    createdBy,
    createdAt: typeof record.createdAt === "number" ? record.createdAt : 0,
    updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : 0,
    // Absent means active. A definition is only retired when someone says so.
    archived: record.archived === true,
    schemaVersion:
      typeof record.schemaVersion === "number"
        ? record.schemaVersion
        : SEMANTIC_DEFINITION_SCHEMA_VERSION,
  };
}

/** The definitions a teacher may pick from while authoring one question.
 *
 *  Archived ones are withheld from NEW selection but remain perfectly valid
 *  wherever they are already referenced — that is the whole difference between
 *  archiving and deleting.
 *
 *  Narrowed to the question's own subject and topic, because a definition
 *  belongs to a scope and offering "İşaret aktarımı" from Denklemler while
 *  authoring a Geometri question invites exactly the sloppy reuse that would
 *  make the shared identity meaningless.
 *
 *  Deterministic: label order, so the same vocabulary always reads the same. */
export function selectableDefinitions(
  definitions: readonly SemanticDefinition[],
  subject: string,
  topic: string,
): SemanticDefinition[] {
  const wantedSubject = subject.trim();
  const wantedTopic = topic.trim();
  if (!wantedSubject || !wantedTopic) return [];
  return definitions
    .filter(
      (definition) =>
        !definition.archived &&
        definition.subject === wantedSubject &&
        definition.topic === wantedTopic,
    )
    .sort((a, b) => a.label.localeCompare(b.label, "tr"));
}

/** Whether an ACTIVE definition in the same scope already carries this label.
 *
 *  Used only to warn. It never merges, never blocks and never rewrites: two
 *  authors may legitimately want two definitions that read alike, and the
 *  product has no basis for deciding they are the same idea. Comparison is
 *  case-insensitive and trim-only — deliberately crude, because a smarter
 *  match would start making exactly the similarity judgement this whole phase
 *  exists to avoid. */
export function findDuplicateLabel(
  definitions: readonly SemanticDefinition[],
  label: string,
  subject: string,
  topic: string,
): SemanticDefinition | null {
  const wanted = label.trim().toLocaleLowerCase("tr");
  if (!wanted) return null;
  return (
    selectableDefinitions(definitions, subject, topic).find(
      (definition) => definition.label.toLocaleLowerCase("tr") === wanted,
    ) ?? null
  );
}
