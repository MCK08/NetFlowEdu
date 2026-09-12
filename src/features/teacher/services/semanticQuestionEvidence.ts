import {
  buildVerifiedChoicePatterns,
  eventSelectsScopedIdentity,
  ScopedSemanticIdentity,
  scopedIdentityOfPattern,
} from "@features/study/services/verifiedChoicePatterns";
import { CHOICE_LABELS, ChoiceLabel, Question } from "@/types/question";

import { ClassSemanticStudentEvidence } from "./classSemanticCohorts";

// Phase 85 — the QUESTION side of one shared definition.
//
// THE QUESTION THIS ANSWERS
//
// Phase 82 says how many questions were authored with a definition. Phase 83
// says which students repeated it. Phase 84 says in what order it happened.
// None of them says the thing an author actually needs in order to improve
// their own material: *which* of my questions carry this meaning, on *which*
// wrong option, with *what* feedback attached, and what the records show around
// that exact question.
//
// WHAT THIS REFUSES TO SAY
//
// That a question is bad. That a distractor is too tempting. That the teaching
// is wrong. That something should be fixed. A wrong option being selected is
// what a wrong option is FOR; an option carrying an authored meaning that gets
// picked is the feature working, not failing. So there is no quality score, no
// difficulty figure, no confusion metric, no severity and no recommendation
// anywhere in this file. The teacher looks at their own question and decides.
//
// TWO COUNTS THAT MUST NOT BE MIXED
//
// `observedSelector*` is everyone whose loaded records show them selecting this
// meaning on this question — including someone who did it exactly once.
// `verifiedPatternStudent*` is the strictly smaller set Phase 78 counts: those
// who repeated it across at least two distinct questions. One selection is a
// recorded moment and not a pattern, and collapsing the two would quietly
// inflate every number this surface shows.

/** Whether the viewer may revise this question, as the RULES define it.
 *
 *  `questions` update is `isOwner(resource.data.ownerId)` and nothing else: a
 *  teacher cannot edit a student member's class question, and a student cannot
 *  edit the teacher's. That boundary is reported here, never widened. */
export type QuestionAuthorability =
  /** The viewer is this question's author. */
  | "own"
  /** Someone else in the class authored it. Readable, not editable. */
  | "other_author";

export interface SemanticQuestionEvidence {
  /** Internal only — never rendered. */
  questionId: string;
  question: Question;
  definitionId: string;
  /** Every wrong option on this question that points at this definition. */
  mappedChoiceLabels: ChoiceLabel[];
  mappedChoiceCount: number;
  /** Anyone whose loaded records show a selection of this meaning HERE. */
  observedSelectorStudentIds: string[];
  observedSelectorCount: number;
  /** The subset Phase 78 counts as a repeated pattern. Always <= the above. */
  verifiedPatternStudentIds: string[];
  verifiedPatternStudentCount: number;
  /** Total selections of this meaning on this question in the window. */
  selectionOccurrenceCount: number;
  latestEvidenceAt: number | null;
  participatesInVerifiedPattern: boolean;
  authorability: QuestionAuthorability;
}

export interface SemanticQuestionEvidenceList {
  questions: SemanticQuestionEvidence[];
  /** Questions authored with this definition but with no selections in the
   *  loaded window. A normal state — most questions are answered correctly. */
  questionsWithoutEvidenceCount: number;
  isEmpty: boolean;
}

/** How many question rows show before the rest fold away. */
export const MAX_INITIAL_EVIDENCE_QUESTIONS = 4;

/** The wrong options on this question that explicitly reference the definition.
 *
 *  `semanticDefinitionId` is the whole association — never a label, never a
 *  conceptKey, never the option's text. A question is listed once however many
 *  of its options point at the same definition; the count is reported
 *  separately rather than by listing the question twice. */
function mappedLabelsFor(question: Question, definitionId: string): ChoiceLabel[] {
  const feedback = question.choiceFeedback;
  if (!feedback) return [];
  const labels: ChoiceLabel[] = [];
  for (const label of CHOICE_LABELS) {
    if (feedback[label]?.semanticDefinitionId === definitionId) labels.push(label);
  }
  return labels;
}

/** The questions carrying one shared definition, with what the records show.
 *
 *  Pure: no Firebase, no clock, no randomness. One pass over the class question
 *  inventory Phase 82 already loaded, plus one pass per student over the
 *  bounded window Phase 83 already loaded. No read is performed here and none
 *  is triggered by it. */
export function buildSemanticQuestionEvidence(params: {
  classId: string;
  scoped: ScopedSemanticIdentity;
  /** Phase 82's class question inventory. */
  questions: readonly Question[];
  /** Phase 83's bounded class semantic evidence. */
  students: readonly ClassSemanticStudentEvidence[];
  /** Whose questions count as "own". */
  viewerUid: string | undefined;
}): SemanticQuestionEvidenceList {
  const definitionId = params.scoped.identity.semanticId;

  // Which class questions reference this definition at all. Cross-class is
  // impossible here: a question from another class never enters the list.
  const mapped = new Map<string, { question: Question; labels: ChoiceLabel[] }>();
  for (const question of params.questions) {
    if (question.classId !== params.classId) continue;
    const labels = mappedLabelsFor(question, definitionId);
    if (labels.length === 0) continue;
    mapped.set(question.id, { question, labels });
  }
  if (mapped.size === 0) {
    return { questions: [], questionsWithoutEvidenceCount: 0, isEmpty: true };
  }

  const observed = new Map<string, Set<string>>();
  const occurrences = new Map<string, number>();
  const latest = new Map<string, number>();
  const verified = new Map<string, Set<string>>();

  for (const student of params.students) {
    // Every recorded selection of this meaning, wherever it happened.
    for (const event of student.events) {
      if (!eventSelectsScopedIdentity(event, params.scoped)) continue;
      if (!mapped.has(event.questionId)) continue;
      const seen = observed.get(event.questionId) ?? new Set<string>();
      seen.add(student.studentUid);
      observed.set(event.questionId, seen);
      occurrences.set(event.questionId, (occurrences.get(event.questionId) ?? 0) + 1);
      const previous = latest.get(event.questionId);
      if (previous === undefined || event.occurredAt > previous) {
        latest.set(event.questionId, event.occurredAt);
      }
    }

    // The canonical Phase 78 verdict, read rather than re-derived. A student
    // only counts as verified on the questions their OWN qualifying pattern is
    // built from.
    const memory = buildVerifiedChoicePatterns({
      events: student.events,
      maxPatterns: Number.POSITIVE_INFINITY,
    });
    const pattern = memory.patterns.find((candidate) => {
      const scope = scopedIdentityOfPattern(candidate);
      return (
        scope.identity.namespaceKind === params.scoped.identity.namespaceKind &&
        scope.identity.namespaceId === params.scoped.identity.namespaceId &&
        scope.identity.semanticId === definitionId &&
        scope.subject === params.scoped.subject &&
        scope.topic === params.scoped.topic
      );
    });
    if (!pattern) continue;
    for (const questionId of pattern.questionIds) {
      if (!mapped.has(questionId)) continue;
      const set = verified.get(questionId) ?? new Set<string>();
      set.add(student.studentUid);
      verified.set(questionId, set);
    }
  }

  const rows: SemanticQuestionEvidence[] = [];
  for (const [questionId, entry] of mapped) {
    const observedIds = [...(observed.get(questionId) ?? [])].sort((a, b) => a.localeCompare(b));
    const verifiedIds = [...(verified.get(questionId) ?? [])].sort((a, b) => a.localeCompare(b));
    rows.push({
      questionId,
      question: entry.question,
      definitionId,
      mappedChoiceLabels: entry.labels,
      mappedChoiceCount: entry.labels.length,
      observedSelectorStudentIds: observedIds,
      observedSelectorCount: observedIds.length,
      verifiedPatternStudentIds: verifiedIds,
      verifiedPatternStudentCount: verifiedIds.length,
      selectionOccurrenceCount: occurrences.get(questionId) ?? 0,
      latestEvidenceAt: latest.get(questionId) ?? null,
      participatesInVerifiedPattern: verifiedIds.length > 0,
      authorability:
        params.viewerUid && entry.question.ownerId === params.viewerUid ? "own" : "other_author",
    });
  }

  rows.sort(compareQuestions);

  return {
    questions: rows,
    questionsWithoutEvidenceCount: rows.filter((row) => row.observedSelectorCount === 0).length,
    isEmpty: false,
  };
}

/** Reading order: verified breadth, then recency, then observed breadth, then
 *  a stable fallback.
 *
 *  Deliberately NOT a quality ranking. The question at the top is the one with
 *  the most recorded evidence around it, which is a fact about the records —
 *  not a claim that it is the worst question, or that it needs anything. */
function compareQuestions(a: SemanticQuestionEvidence, b: SemanticQuestionEvidence): number {
  if (b.verifiedPatternStudentCount !== a.verifiedPatternStudentCount) {
    return b.verifiedPatternStudentCount - a.verifiedPatternStudentCount;
  }
  const aAt = a.latestEvidenceAt ?? 0;
  const bAt = b.latestEvidenceAt ?? 0;
  if (aAt !== bAt) return bAt - aAt;
  if (b.observedSelectorCount !== a.observedSelectorCount) {
    return b.observedSelectorCount - a.observedSelectorCount;
  }
  const aText = a.question.description ?? "";
  const bText = b.question.description ?? "";
  const byText = aText.localeCompare(bText, "tr");
  return byText !== 0 ? byText : a.questionId.localeCompare(b.questionId);
}

/** The text of one mapped option, as currently authored. */
export function mappedChoiceText(row: SemanticQuestionEvidence, label: ChoiceLabel): string | null {
  const text = row.question.choices?.[label];
  return typeof text === "string" && text.trim().length > 0 ? text.trim() : null;
}

/** The author's own feedback for one mapped option, as currently authored. */
export function mappedChoiceFeedback(
  row: SemanticQuestionEvidence,
  label: ChoiceLabel,
): string | null {
  const text = row.question.choiceFeedback?.[label]?.text;
  return typeof text === "string" && text.trim().length > 0 ? text.trim() : null;
}

// Teacher-facing copy.
//
// Every line states a count of records. None of them grades the question, and
// none of them tells the author what to do: an option being chosen is what a
// distractor is for, and treating that as a defect would be the judgement this
// phase exists to refuse.

export const QUESTION_SECTION_TITLE = "Bu etiketi kullanan sorular";

/** Said once above the rows, so nothing below reads as a verdict. */
export const QUESTION_SECTION_NOTE =
  "Bir şıkkın seçilmesi sorunun hatalı olduğu anlamına gelmez. Bu sayılar yalnızca son öğrenme kayıtlarında ne olduğunu gösterir.";

/** Which option carries the meaning, named by its label. */
export function mappedChoiceLine(row: SemanticQuestionEvidence): string {
  if (row.mappedChoiceCount === 1) return `${row.mappedChoiceLabels[0]} şıkkına bağlı`;
  return `${row.mappedChoiceLabels.join(", ")} şıklarına bağlı`;
}

/** What the records show around this question. Two counts, never merged. */
export function questionEvidenceLine(row: SemanticQuestionEvidence): string {
  if (row.observedSelectorCount === 0) {
    return "Son öğrenme kayıtlarında bu seçim burada görülmedi.";
  }
  const observed = `${row.observedSelectorCount} öğrencinin son öğrenme kayıtlarında bu seçime rastlandı`;
  if (row.verifiedPatternStudentCount === 0) return `${observed}.`;
  return `${observed}; ${row.verifiedPatternStudentCount} öğrencide doğrulanmış örüntünün parçası.`;
}

/** The Phase 84 relationship, when there is one. */
export function questionTimelineLine(row: SemanticQuestionEvidence): string | null {
  return row.participatesInVerifiedPattern ? "Bu soru kanıt geçmişinde yer alıyor." : null;
}

export function authorabilityLabel(row: SemanticQuestionEvidence): string {
  return row.authorability === "own" ? "Senin sorun" : "Başka bir yazarın sorusu";
}

/** Why an author cannot revise someone else's question. Stated as the ownership
 *  fact it is, never as a permission error. */
export function authorabilityNote(row: SemanticQuestionEvidence): string | null {
  if (row.authorability === "own") return null;
  return "Bu soruyu sınıftaki başka bir yazar oluşturdu; yalnızca inceleyebilirsin.";
}

/** What an empty list should say. */
export function questionAbsenceCopy(): { title: string; description: string } {
  return {
    title: "Bu etiket henüz bir soruya bağlı değil",
    description:
      "Bir soru hazırlarken yanlış bir şıkka bu ortak etiketi eklediğinde, soru burada görünür.",
  };
}
