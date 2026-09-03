import { buildLearningState, LearningState } from "@features/study/services/learningState";
import { resolveOutcomeHistory } from "@features/study/services/outcomeCounters";
import { StudyItem } from "@features/study/services/studyService";
import { Question } from "@/types/question";

// Phase 73 — where a CLASS's learning signals concentrate, by concept.
//
// WHAT THIS IS NOT
//
// Not a gradebook and not a ranking. It answers "which topics is this class
// finding hard", never "which students are good". There is no class mastery
// percentage, no student score and no risk figure anywhere in this file —
// only counts of people, which a teacher can check against reality.
//
// Not a second learning classifier. Phase 42's buildLearningState remains the
// only thing that decides what one question's history means; this groups those
// verdicts per student, then per topic, and decides only how a group is
// PRESENTED.
//
// THE RULE THAT SHAPES THE AGGREGATION
//
// Risk is never averaged away and absence is never counted as success. Two
// students stuck in a topic stay visible behind eight who are fine, and a topic
// where one student is steady and four have no usable evidence is reported as
// needing evidence — not as steady.

/** How a class topic is presented. Derived FROM Phase 42 verdicts, never a
 *  replacement for them, and never shown to the teacher by name. */
export type ClassConceptPresentation =
  | "needs_attention"
  | "recovering"
  | "steady"
  | "insufficient";

/** One student's standing in one topic, reduced from their questions there. */
export type StudentTopicStanding =
  | "persistent_struggle"
  | "recovering"
  | "steady"
  | "insufficient";

export interface ClassConceptStudent {
  studentUid: string;
  displayName: string;
  standing: StudentTopicStanding;
}

export interface ClassConceptCell {
  /** Stable across renders: subject+topic, the key Phase 70/71 already use. */
  id: string;
  subject: string;
  topic: string;
  /** Distinct students with at least one class-sourced item in this topic. */
  studentCount: number;
  persistentStruggleStudents: number;
  recoveringStudents: number;
  steadyStudents: number;
  insufficientStudents: number;
  presentation: ClassConceptPresentation;
  /** The students behind the counts, for the teacher's drill-down. Ordered by
   *  standing then name, so the same evidence always reads the same way. */
  students: ClassConceptStudent[];
}

export interface ClassConceptHeatmap {
  cells: ClassConceptCell[];
  topicsNeedingAttention: number;
  isEmpty: boolean;
}

export interface ClassStudentEvidence {
  studentUid: string;
  displayName: string;
  /** That student's class-sourced study items, already loaded by the class
   *  performance hook. Never re-fetched here. */
  items: readonly StudyItem[];
}

// Reading order: what needs attention first, what is merely unknown last.
const PRESENTATION_ORDER: Readonly<Record<ClassConceptPresentation, number>> = {
  needs_attention: 0,
  recovering: 1,
  steady: 2,
  insufficient: 3,
};

const STANDING_ORDER: Readonly<Record<StudentTopicStanding, number>> = {
  persistent_struggle: 0,
  recovering: 1,
  steady: 2,
  insufficient: 3,
};

/** One student's standing in one topic, reduced from their Phase 42 verdicts.
 *
 *  The same conservative ladder Phase 70 applies to a concept: an unresolved
 *  struggle on any question wins, and calling the topic steady needs standing
 *  success on MORE THAN HALF the questions the student has met there. One
 *  solved question among four unknowns is not a grip on the topic. */
function reduceStanding(states: readonly LearningState[]): StudentTopicStanding {
  if (states.some((state) => state === "persistent_struggle")) return "persistent_struggle";
  if (states.some((state) => state === "recovering")) return "recovering";
  const steady = states.filter((state) => state === "stable").length;
  return steady * 2 > states.length ? "steady" : "insufficient";
}

/** How the class topic is presented, from its students' standings.
 *
 *  Ordered checks, most conservative first. `needs_attention` is checked before
 *  anything else precisely so a repeated struggle cannot be diluted by the
 *  students around it, and `steady` needs a majority so a topic most of the
 *  class has no usable evidence for is never reported as solid. */
function resolvePresentation(
  persistent: number,
  recovering: number,
  steady: number,
  studentCount: number,
): ClassConceptPresentation {
  if (persistent > 0) return "needs_attention";
  if (recovering > 0) return "recovering";
  if (steady * 2 > studentCount) return "steady";
  return "insufficient";
}

/** The class's concept picture, derived entirely from evidence already loaded.
 *
 *  Pure: no clock, no Firebase, no randomness. One pass over students × their
 *  items, then one sort — O(n log n) over data already in memory, never a query
 *  per student and never a query per topic. */
export function buildClassConceptHeatmap(params: {
  students: readonly ClassStudentEvidence[];
  questionsById: ReadonlyMap<string, Question | null>;
}): ClassConceptHeatmap {
  // topicKey -> studentUid -> that student's Phase 42 verdicts in this topic
  const byTopic = new Map<
    string,
    { subject: string; topic: string; byStudent: Map<string, { displayName: string; states: LearningState[] }> }
  >();

  for (const student of params.students) {
    for (const item of student.items) {
      const question = params.questionsById.get(item.questionId) ?? null;
      const subject = question?.subject.trim() ?? "";
      const topic = question?.topic.trim() ?? "";
      // A question whose metadata will not resolve has no concept to belong
      // to. Bucketing those together would invent a relationship between
      // questions that have nothing to do with each other — the same rule
      // Phase 62/70/71 already apply.
      if (!subject || !topic) continue;

      // Phase 42 is the authority. Phase 41's completeness rule decides what
      // it is allowed to see: a null history is UNKNOWN and classifies as
      // insufficient_data, never as "never struggled".
      const state = buildLearningState({
        history: resolveOutcomeHistory({
          attemptCount: item.attemptCount,
          solvedCount: item.solvedCount ?? null,
          struggledCount: item.struggledCount ?? null,
          againCount: item.againCount ?? null,
        }),
        lastOutcome: item.lastOutcome,
        status: item.status,
        successfulReviews: item.successfulReviews,
      });

      const key = `${subject}|${topic}`;
      let group = byTopic.get(key);
      if (!group) {
        group = { subject, topic, byStudent: new Map() };
        byTopic.set(key, group);
      }
      let entry = group.byStudent.get(student.studentUid);
      if (!entry) {
        entry = { displayName: student.displayName, states: [] };
        group.byStudent.set(student.studentUid, entry);
      }
      entry.states.push(state);
    }
  }

  const cells: ClassConceptCell[] = [];
  for (const [id, group] of byTopic) {
    const students: ClassConceptStudent[] = [];
    for (const [studentUid, entry] of group.byStudent) {
      students.push({
        studentUid,
        displayName: entry.displayName,
        standing: reduceStanding(entry.states),
      });
    }

    students.sort((a, b) => {
      const byStanding = STANDING_ORDER[a.standing] - STANDING_ORDER[b.standing];
      if (byStanding !== 0) return byStanding;
      const byName = a.displayName.localeCompare(b.displayName, "tr");
      return byName !== 0 ? byName : a.studentUid.localeCompare(b.studentUid);
    });

    const persistent = students.filter((s) => s.standing === "persistent_struggle").length;
    const recovering = students.filter((s) => s.standing === "recovering").length;
    const steady = students.filter((s) => s.standing === "steady").length;
    const insufficient = students.filter((s) => s.standing === "insufficient").length;

    cells.push({
      id,
      subject: group.subject,
      topic: group.topic,
      studentCount: students.length,
      persistentStruggleStudents: persistent,
      recoveringStudents: recovering,
      steadyStudents: steady,
      insufficientStudents: insufficient,
      presentation: resolvePresentation(persistent, recovering, steady, students.length),
      students,
    });
  }

  // Deterministic: attention first, then how many students are affected, then
  // the topic key. Insertion order is never relied on.
  cells.sort((a, b) => {
    const byPresentation =
      PRESENTATION_ORDER[a.presentation] - PRESENTATION_ORDER[b.presentation];
    if (byPresentation !== 0) return byPresentation;
    if (a.persistentStruggleStudents !== b.persistentStruggleStudents) {
      return b.persistentStruggleStudents - a.persistentStruggleStudents;
    }
    if (a.studentCount !== b.studentCount) return b.studentCount - a.studentCount;
    return a.id.localeCompare(b.id, "tr");
  });

  return {
    cells,
    topicsNeedingAttention: cells.filter((cell) => cell.presentation === "needs_attention").length,
    isEmpty: cells.length === 0,
  };
}

// Teacher-facing wording. Descriptive and factual: each line states what the
// records show about a topic, never a verdict about a student.
const PRESENTATION_LABEL: Readonly<Record<ClassConceptPresentation, string>> = {
  needs_attention: "Tekrar eden zorlanma",
  recovering: "Toparlanma görülüyor",
  steady: "İstikrarlı kanıt",
  insufficient: "Yeterli kanıt yok",
};

export function conceptCellLabel(cell: ClassConceptCell): string {
  return PRESENTATION_LABEL[cell.presentation];
}

const STANDING_LABEL: Readonly<Record<StudentTopicStanding, string>> = {
  persistent_struggle: "Tekrar eden zorlanma",
  recovering: "Toparlanıyor",
  steady: "İstikrarlı",
  insufficient: "Daha fazla kanıt gerekiyor",
};

export function standingLabel(standing: StudentTopicStanding): string {
  return STANDING_LABEL[standing];
}

/** The counts behind a topic, as raw student counts and never as a share.
 *
 *  Only non-zero facts are returned, so a teacher never reads "0 öğrencide
 *  toparlanma" — an absence is not a finding. */
export function conceptCellFacts(cell: ClassConceptCell): string[] {
  const facts: string[] = [];
  if (cell.persistentStruggleStudents > 0) {
    facts.push(`${cell.persistentStruggleStudents} öğrencide tekrar eden zorlanma`);
  }
  if (cell.recoveringStudents > 0) {
    facts.push(`${cell.recoveringStudents} öğrencide toparlanma`);
  }
  if (cell.steadyStudents > 0) {
    facts.push(`${cell.steadyStudents} öğrencide istikrarlı kanıt`);
  }
  if (cell.insufficientStudents > 0) {
    facts.push(`${cell.insufficientStudents} öğrencide yeterli kanıt yok`);
  }
  return facts;
}
