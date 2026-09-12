import {
  normalizeLabelForComparison,
  SemanticDefinition,
} from "@features/questions/services/semanticDefinition";
import { CHOICE_LABELS, Question } from "@/types/question";

// Phase 82 — where a class's shared instructional labels are actually used.
//
// WHAT THIS COUNTS
//
// Distinct class questions whose author EXPLICITLY pointed a wrong option at a
// definition's canonical id. That is the only association this file knows how
// to make, and it is the same act Phase 80 built the identity around.
//
// WHAT IT REFUSES TO COUNT
//
// A matching label. A matching description. A matching conceptKey. A matching
// subject or topic. A similar string. Anything a model might think is related.
// Two definitions that read identically stay two definitions here, because the
// only thing that makes two questions share a meaning is an author having
// chosen the same definition on purpose.
//
// WHY A COUNT AND NOT A SCORE
//
// A usage count is a fact about AUTHORING — how often a label has been reused —
// and nothing about how well anyone is learning. Zero questions is not a
// failing grade, one is not "weak", and six is not "good"; a definition written
// for a rare but important distractor is doing its job at one. So there is no
// percentage, no coverage score and no health state anywhere in this file, and
// the copy at the bottom states counts and stops.

/** One definition and the factual usage behind it. */
export interface SemanticDefinitionCoverage {
  definition: SemanticDefinition;
  /** DISTINCT questions referencing this definition. A question that maps the
   *  same definition onto three different wrong options is one question that
   *  uses it, not three. */
  questionCount: number;
  /** Those questions, in the order the inventory supplied them, so a detail
   *  view can list them without a second pass or a second query. */
  questionIds: string[];
  /** Another ACTIVE definition in the same subject and topic reads the same
   *  after trim and case folding. A warning, never a merge. */
  hasDuplicateLabel: boolean;
}

export interface ClassSemanticVocabulary {
  active: SemanticDefinitionCoverage[];
  archived: SemanticDefinitionCoverage[];
  /** How many questions were actually examined. Stated so the counts can be
   *  described as what they are rather than implied to be lifetime totals. */
  scannedQuestionCount: number;
  /** True when the inventory stopped at its bound, so some class questions were
   *  never examined. The copy below changes when this is set — an unbounded
   *  claim made from a bounded read is the exact dishonesty this flag prevents. */
  isBounded: boolean;
  /** References to definition ids this class's vocabulary does not contain.
   *
   *  Reported as a count and nothing else. The id is real and was really
   *  authored, but with no definition to resolve it there is no label to show,
   *  and inventing one — or matching it to a same-looking definition — would be
   *  precisely the identity guessing this design refuses. */
  unresolvedReferenceCount: number;
  isEmpty: boolean;
}

/** Every definition id one question explicitly references, deduplicated.
 *
 *  `semanticDefinitionId` is the whole association. An entry carrying only a
 *  private `conceptKey` yields nothing here, which is how author-scoped
 *  vocabulary stays out of the shared picture entirely — the sanitiser already
 *  guarantees the two are mutually exclusive on one entry. */
function referencedDefinitionIds(question: Question): Set<string> {
  const ids = new Set<string>();
  const feedback = question.choiceFeedback;
  if (!feedback) return ids;
  for (const label of CHOICE_LABELS) {
    const id = feedback[label]?.semanticDefinitionId;
    if (typeof id === "string" && id.length > 0) ids.add(id);
  }
  return ids;
}

/** The class's vocabulary with its usage, derived from data already loaded.
 *
 *  Pure: no Firestore, no clock, no randomness. One pass over the questions,
 *  one over the definitions, then two sorts — O(Q + D log D), since the inner
 *  loop is the fixed five choice labels. Never a query per definition or per
 *  question. */
export function buildClassSemanticVocabulary(params: {
  classId: string;
  definitions: readonly SemanticDefinition[];
  /** The class question inventory the caller already loaded. */
  questions: readonly Question[];
  /** Whether that inventory stopped at its bound. */
  isBounded: boolean;
}): ClassSemanticVocabulary {
  const known = new Map<string, SemanticDefinition>();
  for (const definition of params.definitions) {
    // A definition belonging to a different class cannot appear in this
    // vocabulary. Unreachable today — the read path IS the class subcollection —
    // and checked anyway so it stays unreachable if that ever changes.
    if (definition.classId !== params.classId) continue;
    known.set(definition.id, definition);
  }

  const questionsByDefinition = new Map<string, string[]>();
  let scannedQuestionCount = 0;
  const unresolved = new Set<string>();

  for (const question of params.questions) {
    // Cross-class isolation. A question from another class never contributes,
    // whatever its ids, labels or topic happen to look like.
    if (question.classId !== params.classId) continue;
    scannedQuestionCount += 1;

    for (const definitionId of referencedDefinitionIds(question)) {
      if (!known.has(definitionId)) {
        unresolved.add(definitionId);
        continue;
      }
      const bucket = questionsByDefinition.get(definitionId);
      if (bucket) bucket.push(question.id);
      else questionsByDefinition.set(definitionId, [question.id]);
    }
  }

  // How many ACTIVE definitions in one scope share a label. Computed once
  // rather than re-scanned per definition, and only over active ones: an
  // archived definition cannot be picked again, so it cannot be confused with
  // anything at the moment of choosing.
  const labelCounts = new Map<string, number>();
  for (const definition of known.values()) {
    if (definition.archived) continue;
    const key = duplicateKey(definition);
    labelCounts.set(key, (labelCounts.get(key) ?? 0) + 1);
  }

  const active: SemanticDefinitionCoverage[] = [];
  const archived: SemanticDefinitionCoverage[] = [];
  for (const definition of known.values()) {
    const questionIds = questionsByDefinition.get(definition.id) ?? [];
    const entry: SemanticDefinitionCoverage = {
      definition,
      questionCount: questionIds.length,
      questionIds,
      hasDuplicateLabel:
        !definition.archived && (labelCounts.get(duplicateKey(definition)) ?? 0) > 1,
    };
    if (definition.archived) archived.push(entry);
    else active.push(entry);
  }

  active.sort(compareCoverage);
  archived.sort(compareCoverage);

  return {
    active,
    archived,
    scannedQuestionCount,
    isBounded: params.isBounded,
    unresolvedReferenceCount: unresolved.size,
    isEmpty: active.length === 0 && archived.length === 0,
  };
}

/** The scope-plus-label key two definitions must share to read alike. Uses
 *  Phase 80's own comparison so the composer's warning and this one cannot
 *  drift apart. */
function duplicateKey(definition: SemanticDefinition): string {
  return [
    definition.subject,
    definition.topic,
    normalizeLabelForComparison(definition.label),
  ].join("|");
}

/** Reading order for a vocabulary list: alphabetical by label, then scope, then
 *  the id as a last resort.
 *
 *  Deliberately NOT usage-ordered. Sorting by question count would rank the
 *  vocabulary by how much it has been used, which reads as a quality ranking of
 *  labels that are all equally legitimate — an unused definition is not at the
 *  bottom of anything. A teacher looking for a label looks for its name. */
function compareCoverage(a: SemanticDefinitionCoverage, b: SemanticDefinitionCoverage): number {
  const byLabel = a.definition.label.localeCompare(b.definition.label, "tr");
  if (byLabel !== 0) return byLabel;
  const bySubject = a.definition.subject.localeCompare(b.definition.subject, "tr");
  if (bySubject !== 0) return bySubject;
  const byTopic = a.definition.topic.localeCompare(b.definition.topic, "tr");
  if (byTopic !== 0) return byTopic;
  return a.definition.id.localeCompare(b.definition.id);
}

export interface VocabularyFilter {
  search: string;
  subject: string | null;
  topic: string | null;
}

/** Narrowing a list a teacher is already looking at. Substring, case-folded,
 *  over the label and the author's own description — no fuzzy matching and no
 *  ranking, because a search that guesses is a search you cannot trust to have
 *  shown you everything. */
export function filterCoverage(
  entries: readonly SemanticDefinitionCoverage[],
  filter: VocabularyFilter,
): SemanticDefinitionCoverage[] {
  const needle = normalizeLabelForComparison(filter.search);
  return entries.filter((entry) => {
    if (filter.subject && entry.definition.subject !== filter.subject) return false;
    if (filter.topic && entry.definition.topic !== filter.topic) return false;
    if (!needle) return true;
    const haystack = normalizeLabelForComparison(
      `${entry.definition.label} ${entry.definition.description ?? ""}`,
    );
    return haystack.includes(needle);
  });
}

/** The subjects present in a vocabulary, for the filter row. */
export function vocabularySubjects(vocabulary: ClassSemanticVocabulary): string[] {
  const subjects = new Set<string>();
  for (const entry of [...vocabulary.active, ...vocabulary.archived]) {
    subjects.add(entry.definition.subject);
  }
  return [...subjects].sort((a, b) => a.localeCompare(b, "tr"));
}

/** The topics present, optionally within one subject. */
export function vocabularyTopics(
  vocabulary: ClassSemanticVocabulary,
  subject: string | null,
): string[] {
  const topics = new Set<string>();
  for (const entry of [...vocabulary.active, ...vocabulary.archived]) {
    if (subject && entry.definition.subject !== subject) continue;
    topics.add(entry.definition.topic);
  }
  return [...topics].sort((a, b) => a.localeCompare(b, "tr"));
}

// Teacher-facing copy.
//
// Every line states a count of questions. None of them grades a label: there is
// no "yetersiz", no "zayıf" and no "iyi" here, because a usage count carries no
// such judgement and writing one in would invent it.

/** The usage fact for one definition.
 *
 *  When the inventory was bounded the sentence says so rather than implying a
 *  lifetime total — "yüklenen sorularda" is the difference between a count and
 *  a claim. */
export function coverageUsageLine(
  entry: SemanticDefinitionCoverage,
  isBounded: boolean,
): string {
  if (entry.questionCount === 0) {
    return isBounded ? "Yüklenen sorularda kullanılmıyor" : "Henüz bir soruda kullanılmıyor";
  }
  const count = `${entry.questionCount} soruda kullanılıyor`;
  return isBounded ? `Yüklenen sorularda ${count}` : count;
}

/** The status word. Paired with an icon at the call site so state never depends
 *  on colour alone. */
export function coverageStatusLabel(entry: SemanticDefinitionCoverage): string {
  return entry.definition.archived ? "Arşivlendi" : "Aktif";
}

/** The duplicate-label note, when one applies.
 *
 *  States that another label in the same scope reads the same, and stops. It
 *  does not say which, does not suggest merging them, and does not imply either
 *  is wrong — two authors may legitimately want two labels that read alike, and
 *  nothing in this product can tell whether they mean the same thing. */
export function duplicateLabelNote(entry: SemanticDefinitionCoverage): string | null {
  if (!entry.hasDuplicateLabel) return null;
  return "Bu kapsamda aynı adı taşıyan başka bir ortak etiket daha var. İkisi ayrı etiket olarak kalır.";
}

/** What the archived section should explain about itself. */
export const ARCHIVED_EXPLANATION =
  "Arşivlenen etiketler yeni sorularda seçilemez. Daha önce kullanıldıkları sorularda ve geçmiş kayıtlarda olduğu gibi kalırlar.";

/** The note shown when some class questions were not examined. */
export function boundedInventoryNote(vocabulary: ClassSemanticVocabulary): string | null {
  if (!vocabulary.isBounded) return null;
  return `Kullanım sayıları en son yüklenen ${vocabulary.scannedQuestionCount} sınıf sorusuna göre hesaplandı.`;
}

/** What an empty list should say. Three situations, three sentences. */
export function vocabularyAbsenceCopy(vocabulary: ClassSemanticVocabulary): {
  title: string;
  description: string;
} {
  if (vocabulary.isEmpty) {
    return {
      title: "Henüz ortak etiket yok",
      description:
        "Ortak etiketler, aynı anlamı birden fazla soruda yeniden kullanmanızı sağlar. Soru hazırlarken bir şıkka etiket ekleyerek başlayabilirsiniz.",
    };
  }
  if (vocabulary.active.length === 0) {
    return { title: "Aktif ortak etiket yok", description: ARCHIVED_EXPLANATION };
  }
  return {
    title: "Bu aramaya uyan etiket yok",
    description: "Farklı bir arama ya da filtre deneyin.",
  };
}
