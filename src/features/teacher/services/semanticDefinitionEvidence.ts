import { SemanticDefinition } from "@features/questions/services/semanticDefinition";

import {
  ClassSemanticStudentEvidence,
  groupSharedSemanticEvidence,
  MIN_COHORT_STUDENTS,
  SharedSemanticEvidenceGroup,
  SharedSemanticEvidenceIndex,
} from "./classSemanticCohorts";

// Phase 83 — what verified learning evidence exists around ONE shared
// definition.
//
// THE QUESTION THIS ANSWERS
//
// Phase 82 can say how many class questions were AUTHORED with a definition.
// Phase 81 can say when SEVERAL students converge on one. Neither answers the
// question a teacher actually asks when they open a definition: "what has this
// meaning actually shown up as, in real learning, so far?" — including when
// the answer is one student, or none.
//
// FOUR THINGS THAT MUST STAY APART
//
//   coverage    how many questions an author put the definition on
//   evidence    which students independently repeated it (Phase 78)
//   cohort      whether two or more of them did (Phase 81)
//   eligibility whether Phase 42/43 say anyone needs help (NOT read here)
//
// Broad coverage with no evidence is a normal state, not a contradiction, and
// this module never lets one number stand in for another. It also never
// touches Phase 43: a definition trail explains evidence, it does not decide
// who a teacher should act on.
//
// ONE TRUTH, NOT TWO
//
// Every student count, recovery flag and question here comes out of
// groupSharedSemanticEvidence — the exact stage Phase 81's cohorts are built
// from. The only thing this file adds is a view over those groups that keeps
// the ones Phase 81 discards (fewer than two students). So a definition that
// reads "2 öğrenci" here is, by construction, the cohort Class Performance
// shows, with the same members, the same question union and the same recovery
// subset.
//
// WHAT "VERIFIED" MEANS AND DOES NOT MEAN
//
// A student is counted only when Phase 78 says so: at least two selections of
// this meaning across at least two distinct questions, inside that student's
// bounded recent class history. One selection is not a pattern. Two on the
// same question are not a pattern. And a pattern is not a diagnosis — it is a
// count of recorded selections, and nothing downstream may upgrade it.

/** One qualifying student's evidence for one definition. Every field is the
 *  canonical per-student verdict, carried, never re-derived. */
export interface DefinitionStudentEvidence {
  /** Internal only — a navigation key, never rendered. */
  studentUid: string;
  displayName: string;
  occurrenceCount: number;
  distinctQuestionCount: number;
  latestSelectionAt: number;
  /** Phase 79 — currently shows declined-opportunity evidence. Not "resolved":
   *  the pattern happened and stays in this list; this says what happened
   *  after it, and it is withdrawn if the meaning is selected again. */
  hasRecoverySignal: boolean;
  supportingQuestionIds: string[];
}

export interface SemanticDefinitionEvidence {
  definitionId: string;
  subject: string;
  topic: string;
  /** Students who each independently satisfy Phase 78 for this definition, in
   *  reading order. Each appears exactly once. */
  students: DefinitionStudentEvidence[];
  verifiedStudentCount: number;
  activeRepeatedStudentIds: string[];
  recoverySignalStudentIds: string[];
  /** UNION of the questions behind every qualifying student's pattern. Not a
   *  sum of per-student counts: A on {Q1,Q2} and B on {Q2,Q3} is three
   *  questions, not four. Distinct from Phase 82's authored coverage. */
  supportingQuestionIds: string[];
  distinctSupportingQuestionCount: number;
  /** Total qualifying selections across every counted student. A count of
   *  recorded events inside the bounded window — never a strength. */
  selectedOccurrenceCount: number;
  latestEvidenceAt: number | null;
  /** True exactly when Phase 81 would build a cohort for this definition. Read
   *  from Phase 81's own constant so the two can never disagree. */
  classCohortQualified: boolean;
  /** The newest stored label snapshot among the evidence, for the case where
   *  the definition itself cannot be resolved. Display fallback only. */
  snapshotLabel: string | null;
}

export interface SemanticDefinitionEvidenceIndex {
  /** Keyed by definitionId. Groups for the same definition met in different
   *  subject/topic scopes are kept SEPARATE inside the entry — see
   *  `evidenceForDefinition`, which picks the one matching the definition's own
   *  scope — so this stays exactly as strict as Phase 81. */
  byDefinitionId: Map<string, SemanticDefinitionEvidence[]>;
  qualifyingStudentCount: number;
  /** How many students' histories were examined. Stated so a zero can be read
   *  as "nobody, out of N" rather than an absolute. */
  examinedStudentCount: number;
}

/** How many students the detail shows before folding the rest behind a
 *  control. A trail is something to read, not a roster to scroll. */
export const MAX_INITIAL_EVIDENCE_STUDENTS = 5;

function orderStudents(students: DefinitionStudentEvidence[]): DefinitionStudentEvidence[] {
  // Still-repeating first, then most recent evidence, then breadth, then the
  // name. Factual grouping and recency — no weighted score, no "worry" order.
  return [...students].sort((a, b) => {
    if (a.hasRecoverySignal !== b.hasRecoverySignal) return a.hasRecoverySignal ? 1 : -1;
    if (b.latestSelectionAt !== a.latestSelectionAt) return b.latestSelectionAt - a.latestSelectionAt;
    if (b.distinctQuestionCount !== a.distinctQuestionCount) {
      return b.distinctQuestionCount - a.distinctQuestionCount;
    }
    const byName = a.displayName.localeCompare(b.displayName, "tr");
    return byName !== 0 ? byName : a.studentUid.localeCompare(b.studentUid);
  });
}

function fromGroup(group: SharedSemanticEvidenceGroup): SemanticDefinitionEvidence {
  const students = orderStudents(
    group.members.map((member) => ({
      studentUid: member.studentUid,
      displayName: member.displayName,
      occurrenceCount: member.occurrenceCount,
      distinctQuestionCount: member.distinctQuestionCount,
      latestSelectionAt: member.lastSeenAt,
      hasRecoverySignal: member.hasRecoverySignal,
      supportingQuestionIds: [...member.questionIds],
    })),
  );
  // Sorted so the same evidence always yields the same list, whatever order
  // the events arrived in.
  const supportingQuestionIds = [...group.questionIds].sort((a, b) => a.localeCompare(b));
  return {
    definitionId: group.definitionId,
    subject: group.subject,
    topic: group.topic,
    students,
    verifiedStudentCount: students.length,
    activeRepeatedStudentIds: students.filter((s) => !s.hasRecoverySignal).map((s) => s.studentUid),
    recoverySignalStudentIds: students.filter((s) => s.hasRecoverySignal).map((s) => s.studentUid),
    supportingQuestionIds,
    distinctSupportingQuestionCount: supportingQuestionIds.length,
    selectedOccurrenceCount: students.reduce((sum, s) => sum + s.occurrenceCount, 0),
    latestEvidenceAt: group.lastSeenAt,
    classCohortQualified: students.length >= MIN_COHORT_STUDENTS,
    snapshotLabel: group.label,
  };
}

/** The class's definition-centric evidence index.
 *
 *  Pure: no Firebase, no clock, no randomness. Delegates every qualification
 *  decision to groupSharedSemanticEvidence, so this is a re-keying of Phase
 *  81's own groups — nothing about who qualifies, on what, or with what
 *  recovery state is decided here. Complexity is the shared stage's plus one
 *  pass over its groups. */
export function buildSemanticDefinitionEvidenceIndex(params: {
  classId: string;
  students: readonly ClassSemanticStudentEvidence[];
}): SemanticDefinitionEvidenceIndex {
  const shared: SharedSemanticEvidenceIndex = groupSharedSemanticEvidence(params);
  const byDefinitionId = new Map<string, SemanticDefinitionEvidence[]>();
  for (const group of shared.groups.values()) {
    const evidence = fromGroup(group);
    const existing = byDefinitionId.get(group.definitionId);
    if (existing) existing.push(evidence);
    else byDefinitionId.set(group.definitionId, [evidence]);
  }
  // Deterministic order among scopes of one definition, for the rare case
  // where a definition was met under mismatched question metadata.
  for (const list of byDefinitionId.values()) {
    list.sort((a, b) => `${a.subject}|${a.topic}`.localeCompare(`${b.subject}|${b.topic}`));
  }
  return {
    byDefinitionId,
    qualifyingStudentCount: shared.qualifyingStudentUids.size,
    examinedStudentCount: params.students.length,
  };
}

/** The empty trail — what a definition with authored coverage but no
 *  qualifying learner reads as. A real value, not null, so the section can
 *  say "none yet, out of N students" rather than rendering nothing. */
export function emptyDefinitionEvidence(definition: {
  id: string;
  subject: string;
  topic: string;
}): SemanticDefinitionEvidence {
  return {
    definitionId: definition.id,
    subject: definition.subject,
    topic: definition.topic,
    students: [],
    verifiedStudentCount: 0,
    activeRepeatedStudentIds: [],
    recoverySignalStudentIds: [],
    supportingQuestionIds: [],
    distinctSupportingQuestionCount: 0,
    selectedOccurrenceCount: 0,
    latestEvidenceAt: null,
    classCohortQualified: false,
    snapshotLabel: null,
  };
}

/** The evidence for one definition, looked up by its OPAQUE id and its own
 *  declared scope — never by label.
 *
 *  Two definitions with identical labels are two entries. The same id string
 *  in another class never reaches this index, because the events were
 *  filtered by class before the shared stage saw them. A definition met under
 *  a different subject/topic than it declares is not folded in: Phase 81 keeps
 *  those apart, and so does this. */
export function evidenceForDefinition(
  index: SemanticDefinitionEvidenceIndex,
  definition: Pick<SemanticDefinition, "id" | "subject" | "topic">,
): SemanticDefinitionEvidence {
  const scopes = index.byDefinitionId.get(definition.id) ?? [];
  const match = scopes.find(
    (entry) => entry.subject === definition.subject && entry.topic === definition.topic,
  );
  return match ?? emptyDefinitionEvidence(definition);
}

// Teacher-facing wording.
//
// Every sentence states a count of real records inside a bounded window. None
// describes a student, none says "resolved", and none promises completeness —
// see BOUNDED_WINDOW_NOTE for the exact scope every number carries.

/** Said once above the numbers, so no count below it can be read as lifetime. */
export const BOUNDED_WINDOW_NOTE =
  "Her öğrencinin bu sınıftaki son öğrenme kayıtlarına dayanır; daha eski kayıtlar bu özete dahil değildir.";

export const EVIDENCE_SECTION_TITLE = "Doğrulanmış öğrenme kanıtı";

export function verifiedStudentsLine(evidence: SemanticDefinitionEvidence): string {
  const n = evidence.verifiedStudentCount;
  if (n === 0) return "Henüz tekrar eden doğrulanmış bir öğrenci örüntüsü yok.";
  if (n === 1) return "1 öğrencide tekrar eden seçim örüntüsü doğrulandı.";
  return `${n} öğrencide ortak doğrulanmış seçim örüntüsü.`;
}

export function supportingQuestionsLine(evidence: SemanticDefinitionEvidence): string | null {
  const n = evidence.distinctSupportingQuestionCount;
  if (n === 0) return null;
  return `${n} farklı soruda doğrulandı.`;
}

export function recoveryLine(evidence: SemanticDefinitionEvidence): string | null {
  const n = evidence.recoverySignalStudentIds.length;
  if (n === 0) return null;
  return `${n} öğrencide sonraki doğrulanmış fırsatlarda bu seçim yeniden görülmedi.`;
}

/** The Phase 81 relationship, stated as a fact about the count. */
export function cohortStatusLine(evidence: SemanticDefinitionEvidence): string | null {
  if (evidence.verifiedStudentCount === 0) return null;
  if (evidence.classCohortQualified) return "Sınıf örüntüsü eşiği karşılandı.";
  return "Tek öğrenci; sınıf örüntüsü değil.";
}

/** Distinguishes authored coverage from learning evidence in one line, so the
 *  larger number can never be read as the smaller one. */
export function coverageVersusEvidenceLine(params: {
  coverageQuestionCount: number;
  evidence: SemanticDefinitionEvidence;
}): string {
  const used = params.coverageQuestionCount;
  const backed = params.evidence.distinctSupportingQuestionCount;
  if (backed === 0) return `Kullanım: ${used} soru · Öğrenme kanıtı: henüz yok`;
  return `Kullanım: ${used} soru · Öğrenme kanıtı: ${backed} soru`;
}

export const STUDENT_REPEATED_LABEL = "Tekrar eden örüntü";
export const STUDENT_RECOVERY_LABEL = "Toparlanma sinyali";

export function studentEvidenceStateLabel(student: DefinitionStudentEvidence): string {
  return student.hasRecoverySignal ? STUDENT_RECOVERY_LABEL : STUDENT_REPEATED_LABEL;
}

export function studentBreadthLine(student: DefinitionStudentEvidence): string {
  return `${student.distinctQuestionCount} farklı soru`;
}
