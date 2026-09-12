import { LearningEvent } from "@features/learningStory/services/learningTrail";
import {
  buildVerifiedChoicePatterns,
  eventDeclinesScopedIdentity,
  eventSelectsScopedIdentity,
  MIN_DISTINCT_QUESTIONS,
  MIN_OCCURRENCES,
  MIN_RECOVERY_DISTINCT_QUESTIONS,
  MIN_RECOVERY_OPPORTUNITIES,
  ScopedSemanticIdentity,
  scopedIdentityOfPattern,
} from "@features/study/services/verifiedChoicePatterns";

import { ClassSemanticStudentEvidence } from "./classSemanticCohorts";

// Phase 84 — how the verified evidence for ONE shared definition unfolded.
//
// WHAT THIS IS
//
// A chronology. It replays, in order, the recorded moments that Phases 78 and
// 79 already count: selections of this exact shared meaning, later occasions
// when the same meaning was genuinely offered and something else was taken, and
// the points at which each canonical threshold first became satisfiable inside
// the loaded window.
//
// WHAT THIS IS NOT
//
// Not a trend. A sequence of selections and declines does not mean improving,
// worsening, learning, or forgetting — those are causal claims about a person,
// and nothing recorded here supports one. Phase 47's improved/worsened stays
// intervention-specific and is not reused as a semantic trend classifier. There
// is no score, no severity, no confidence and no prediction in this file.
//
// ONE SEMANTIC TRUTH
//
// Whether a student qualifies, and whether recovery is CURRENT, are read
// straight off `buildVerifiedChoicePatterns` rather than decided here. Which
// events count as a selection or as a declined opportunity comes from Phase
// 78/79's own exported predicates, and the thresholds are their own exported
// constants. So the walk below contributes exactly one thing — the ORDER, and
// the moment each threshold first held — and cannot disagree with Phase 79's
// verdict, Phase 81's cohorts or Phase 83's summary. A chronology that
// contradicted the summary above it would be worse than no chronology at all.
//
// BOUNDED, AND HONEST ABOUT IT
//
// Everything below describes the loaded per-student window and nothing outside
// it. A milestone means "the first crossing observable in the loaded records",
// never "the first time ever" — older evidence may have already fallen out of
// the window, and this module never reconstructs what it cannot see.

export type SemanticTimelineEntryKind =
  /** A recorded selection of the option carrying this shared meaning. */
  | "selection"
  /** Phase 79 — the meaning was genuinely on offer on a later question and the
   *  student's actual pick was something else. Never inferred from silence. */
  | "declined_opportunity"
  /** Phase 78's two thresholds first held for this student, in this window. */
  | "repeated_pattern_reached"
  /** Phase 79's two thresholds first held, in the window open at that moment. */
  | "recovery_signal_reached"
  /** A later selection re-opened the window, so the recovery evidence above is
   *  no longer current. The history stays; only the claim about NOW changes. */
  | "recovery_signal_withdrawn";

export interface SemanticTimelineEntry {
  /** Internal only. Carries the student uid and the event id, so it is a React
   *  key and never a rendered string. */
  id: string;
  kind: SemanticTimelineEntryKind;
  occurredAt: number;
  /** Internal only — the drilldown key. */
  studentUid: string;
  displayName: string;
  /** Internal only, and null on milestones. A caller may resolve it against
   *  question metadata it ALREADY holds; it is never rendered as an id. */
  questionId: string | null;
}

export interface SemanticTimelineStudentState {
  studentUid: string;
  displayName: string;
  selectionCount: number;
  distinctSelectionQuestionCount: number;
  declinedOpportunityCount: number;
  distinctDeclinedQuestionCount: number;
  /** Null when the two Phase 78 thresholds never both held in this window. */
  repeatedPatternReachedAt: number | null;
  /** Null when Phase 79's thresholds never both held. Non-null does NOT mean
   *  recovery is current — a later selection withdraws that. */
  recoveryReachedAt: number | null;
  /** Phase 79's verdict as of now, read from the canonical pattern. */
  hasCurrentRecoverySignal: boolean;
  /** Whether Phase 78 counts this student as verified. Phase 83's own count is
   *  built from the same classifier, so the two always agree. */
  isVerified: boolean;
  latestRelevantEvidenceAt: number | null;
  supportingQuestionIds: string[];
}

export interface SemanticDefinitionTimeline {
  /** OLDEST → NEWEST, the direction Phase 59's trail already reads in: the
   *  story ends where the class is now. */
  entries: SemanticTimelineEntry[];
  students: SemanticTimelineStudentState[];
  /** Students whose Phase 78 pattern qualifies. Equal by construction to Phase
   *  83's verifiedStudentCount for the same definition. */
  verifiedStudentCount: number;
  /** Students who appear in the chronology at all, including those with a
   *  single selection. A precursor is a real recorded moment; it is simply not
   *  a pattern, and it never inflates the count above. */
  appearingStudentCount: number;
  isEmpty: boolean;
}

/** How many entries a collapsed timeline shows. The most recent stretch, which
 *  is the part a teacher opening a definition is actually asking about; the
 *  rest is one tap away and costs no read, because every event is already in
 *  memory. */
export const MAX_INITIAL_TIMELINE_ENTRIES = 10;

/** The canonical scoped identity for one shared definition.
 *
 *  Rebuilt from the definition's OWN declared scope, exactly as Phase 83's
 *  `evidenceForDefinition` matches on it. Subject and topic are part of the
 *  identity, not decoration: Phase 81 refuses to merge the same definition met
 *  in two different topics, and so does this. */
export function scopedIdentityForDefinition(params: {
  classId: string;
  definitionId: string;
  subject: string;
  topic: string;
}): ScopedSemanticIdentity {
  return {
    identity: {
      namespaceKind: "class",
      namespaceId: params.classId,
      semanticId: params.definitionId,
    },
    subject: params.subject,
    topic: params.topic,
  };
}

/** Milestones sort after the event that triggered them, at the same instant. */
const KIND_RANK: Readonly<Record<SemanticTimelineEntryKind, number>> = {
  selection: 0,
  declined_opportunity: 0,
  repeated_pattern_reached: 1,
  recovery_signal_reached: 1,
  recovery_signal_withdrawn: 1,
};

function chronological(a: SemanticTimelineEntry, b: SemanticTimelineEntry): number {
  if (a.occurredAt !== b.occurredAt) return a.occurredAt - b.occurredAt;
  const byKind = KIND_RANK[a.kind] - KIND_RANK[b.kind];
  if (byKind !== 0) return byKind;
  // Deterministic last resort, so two events written in the same millisecond
  // can never swap places between renders.
  return a.id.localeCompare(b.id);
}

/** One student's chronology for one scoped meaning.
 *
 *  The walk produces ENTRIES and the milestone TIMES. It never decides whether
 *  the student qualifies or whether recovery is current — both of those are
 *  read from the canonical pattern by the caller, so a walk that somehow
 *  disagreed could not change what the product claims. */
function buildStudentTimeline(
  student: ClassSemanticStudentEvidence,
  scoped: ScopedSemanticIdentity,
): { entries: SemanticTimelineEntry[]; state: SemanticTimelineStudentState } | null {
  const selections: LearningEvent[] = [];
  const declines: LearningEvent[] = [];
  for (const event of student.events) {
    if (eventSelectsScopedIdentity(event, scoped)) selections.push(event);
    else if (event.questionId && eventDeclinesScopedIdentity(event, scoped)) declines.push(event);
  }

  // A decline is only meaningful relative to a selection that came before it:
  // Phase 79 measures what happened AFTER the meaning was taken. A student who
  // never took it has nothing to have recovered from, so they do not appear.
  if (selections.length === 0) return null;

  const firstSelectionAt = selections.reduce(
    (min, event) => Math.min(min, event.occurredAt),
    Number.POSITIVE_INFINITY,
  );

  const relevant = [
    ...selections.map((event) => ({ event, isSelection: true })),
    // Declines before the first selection are not evidence of anything and are
    // dropped rather than drawn as a puzzling prologue.
    ...declines
      .filter((event) => event.occurredAt > firstSelectionAt)
      .map((event) => ({ event, isSelection: false })),
  ].sort((a, b) => {
    if (a.event.occurredAt !== b.event.occurredAt) return a.event.occurredAt - b.event.occurredAt;
    // A selection at the same instant re-opens the window, so it is applied
    // first; otherwise a decline could be credited to a window that the
    // selection beside it had already reset.
    if (a.isSelection !== b.isSelection) return a.isSelection ? -1 : 1;
    return a.event.id.localeCompare(b.event.id);
  });

  const entries: SemanticTimelineEntry[] = [];
  const key = (kind: SemanticTimelineEntryKind, event: LearningEvent) =>
    `${kind}\u0000${student.studentUid}\u0000${event.id}`;

  const selectionQuestions = new Set<string>();
  const declinedQuestions = new Set<string>();
  let selectionCount = 0;
  let declinedOpportunityCount = 0;
  let repeatedPatternReachedAt: number | null = null;
  let recoveryReachedAt: number | null = null;

  // The live recovery window, reset by every selection exactly as Phase 79's
  // `since` moves forward to the latest one.
  let windowDeclineCount = 0;
  let windowQuestions = new Set<string>();
  let recoveryCurrentlyHeld = false;

  for (const { event, isSelection } of relevant) {
    if (isSelection) {
      selectionCount += 1;
      selectionQuestions.add(event.questionId);
      entries.push({
        id: key("selection", event),
        kind: "selection",
        occurredAt: event.occurredAt,
        studentUid: student.studentUid,
        displayName: student.displayName,
        questionId: event.questionId,
      });

      if (
        repeatedPatternReachedAt === null &&
        selectionCount >= MIN_OCCURRENCES &&
        selectionQuestions.size >= MIN_DISTINCT_QUESTIONS
      ) {
        repeatedPatternReachedAt = event.occurredAt;
        entries.push({
          id: key("repeated_pattern_reached", event),
          kind: "repeated_pattern_reached",
          occurredAt: event.occurredAt,
          studentUid: student.studentUid,
          displayName: student.displayName,
          questionId: null,
        });
      }

      // The window re-opens here. Evidence earned before a relapse can never be
      // presented as current — the same self-correcting rule Phase 79 gets from
      // moving `since` forward.
      if (recoveryCurrentlyHeld) {
        entries.push({
          id: key("recovery_signal_withdrawn", event),
          kind: "recovery_signal_withdrawn",
          occurredAt: event.occurredAt,
          studentUid: student.studentUid,
          displayName: student.displayName,
          questionId: null,
        });
      }
      windowDeclineCount = 0;
      windowQuestions = new Set<string>();
      recoveryCurrentlyHeld = false;
      continue;
    }

    declinedOpportunityCount += 1;
    declinedQuestions.add(event.questionId);
    entries.push({
      id: key("declined_opportunity", event),
      kind: "declined_opportunity",
      occurredAt: event.occurredAt,
      studentUid: student.studentUid,
      displayName: student.displayName,
      questionId: event.questionId,
    });

    // Recovery is a statement ABOUT a pattern, so there is nothing to recover
    // from until Phase 78's thresholds have held — the same ordering
    // buildVerifiedChoicePatterns enforces by only evaluating recovery for
    // patterns that already qualified.
    if (repeatedPatternReachedAt === null) continue;

    windowDeclineCount += 1;
    windowQuestions.add(event.questionId);
    if (!recoveryCurrentlyHeld && meetsRecoveryThresholds(windowDeclineCount, windowQuestions.size)) {
      recoveryCurrentlyHeld = true;
      if (recoveryReachedAt === null) recoveryReachedAt = event.occurredAt;
      entries.push({
        id: key("recovery_signal_reached", event),
        kind: "recovery_signal_reached",
        occurredAt: event.occurredAt,
        studentUid: student.studentUid,
        displayName: student.displayName,
        questionId: null,
      });
    }
  }

  const latestRelevantEvidenceAt = entries.reduce<number | null>(
    (latest, entry) => (latest === null || entry.occurredAt > latest ? entry.occurredAt : latest),
    null,
  );

  return {
    entries,
    state: {
      studentUid: student.studentUid,
      displayName: student.displayName,
      selectionCount,
      distinctSelectionQuestionCount: selectionQuestions.size,
      declinedOpportunityCount,
      distinctDeclinedQuestionCount: declinedQuestions.size,
      repeatedPatternReachedAt,
      recoveryReachedAt,
      // Filled in by the caller from the canonical pattern.
      hasCurrentRecoverySignal: false,
      isVerified: false,
      latestRelevantEvidenceAt,
      supportingQuestionIds: [...selectionQuestions].sort((a, b) => a.localeCompare(b)),
    },
  };
}

/** Whether a running window satisfies Phase 79.
 *
 *  Both numbers are Phase 79's own exported constants, not re-stated ones: a
 *  one-decline window can never satisfy it, and neither can a window whose
 *  declines all came from the same question. If those thresholds ever change,
 *  this moves with them. */
function meetsRecoveryThresholds(declineCount: number, distinctQuestionCount: number): boolean {
  return (
    declineCount >= MIN_RECOVERY_OPPORTUNITIES &&
    distinctQuestionCount >= MIN_RECOVERY_DISTINCT_QUESTIONS
  );
}

/** The class's chronology for one shared definition.
 *
 *  Pure: no Firebase, no clock, no randomness. One pass per student over that
 *  student's already-loaded bounded window, plus one merge sort of the entries.
 *  No read is performed here and none is triggered by it — the events were
 *  loaded once, for the whole class, before any definition was selected. */
export function buildSemanticDefinitionTimeline(params: {
  scoped: ScopedSemanticIdentity;
  students: readonly ClassSemanticStudentEvidence[];
}): SemanticDefinitionTimeline {
  const entries: SemanticTimelineEntry[] = [];
  const students: SemanticTimelineStudentState[] = [];

  for (const student of params.students) {
    const built = buildStudentTimeline(student, params.scoped);
    if (!built) continue;

    // The canonical verdicts, read rather than re-derived. Whether this student
    // is verified, and whether recovery is CURRENT, are Phase 78/79's answers.
    const memory = buildVerifiedChoicePatterns({
      events: student.events,
      maxPatterns: Number.POSITIVE_INFINITY,
    });
    const pattern = memory.patterns.find((candidate) => {
      const candidateScope = scopedIdentityOfPattern(candidate);
      return (
        candidateScope.identity.namespaceKind === params.scoped.identity.namespaceKind &&
        candidateScope.identity.namespaceId === params.scoped.identity.namespaceId &&
        candidateScope.identity.semanticId === params.scoped.identity.semanticId &&
        candidateScope.subject === params.scoped.subject &&
        candidateScope.topic === params.scoped.topic
      );
    });

    entries.push(...built.entries);
    students.push({
      ...built.state,
      isVerified: pattern !== undefined,
      hasCurrentRecoverySignal: pattern?.recovery != null,
    });
  }

  entries.sort(chronological);

  // Reading order for the roster beneath the thread: verified first, then the
  // most recent evidence, then the name. No worry ranking.
  students.sort((a, b) => {
    if (a.isVerified !== b.isVerified) return a.isVerified ? -1 : 1;
    const aAt = a.latestRelevantEvidenceAt ?? 0;
    const bAt = b.latestRelevantEvidenceAt ?? 0;
    if (aAt !== bAt) return bAt - aAt;
    const byName = a.displayName.localeCompare(b.displayName, "tr");
    return byName !== 0 ? byName : a.studentUid.localeCompare(b.studentUid);
  });

  return {
    entries,
    students,
    verifiedStudentCount: students.filter((student) => student.isVerified).length,
    appearingStudentCount: students.length,
    isEmpty: entries.length === 0,
  };
}

/** The most recent stretch, still read oldest → newest.
 *
 *  Truncation is presentation only: the entries are already in memory, nothing
 *  is re-queried to expand, and no count or milestone anywhere else is computed
 *  from the visible slice. */
export function visibleTimelineEntries(
  timeline: SemanticDefinitionTimeline,
  showAll: boolean,
): SemanticTimelineEntry[] {
  if (showAll || timeline.entries.length <= MAX_INITIAL_TIMELINE_ENTRIES) return timeline.entries;
  return timeline.entries.slice(-MAX_INITIAL_TIMELINE_ENTRIES);
}

// Teacher-facing wording.
//
// Each line states one recorded moment. None of them says why it happened, what
// it means about the learner, or where it is heading — a chronology that
// editorialised would be the trend classifier this phase exists to refuse.

export const TIMELINE_SECTION_TITLE = "Kanıt geçmişi";

export const TIMELINE_OPEN_LABEL = "Kanıt geçmişini gör";

/** Said above the thread, so nothing inside it can be read as lifetime. */
export const TIMELINE_WINDOW_NOTE =
  "Yüklenen son öğrenme kayıtlarına dayanır. Daha eski kayıtlar bu geçmişte yer almaz.";

export function timelineEntryText(entry: SemanticTimelineEntry): string {
  switch (entry.kind) {
    case "selection":
      return "Bu ortak etikete bağlı seçimi yaptı.";
    case "declined_opportunity":
      return "Aynı seçim yeniden sunuldu; başka bir seçenek işaretlendi.";
    case "repeated_pattern_reached":
      return "Farklı sorularda tekrar eden seçim örüntüsü, yüklenen kayıtlar içinde doğrulandı.";
    case "recovery_signal_reached":
      return "Sonraki farklı sorularda bu seçim yeniden yapılmadı; toparlanma sinyali oluştu.";
    case "recovery_signal_withdrawn":
    default:
      return "Seçim yeniden yapıldı; toparlanma sinyali artık güncel değil.";
  }
}

/** The short state word beside a node. Paired with a shape at the call site, so
 *  meaning never depends on colour. */
export function timelineEntryLabel(entry: SemanticTimelineEntry): string {
  switch (entry.kind) {
    case "selection":
      return "Seçim";
    case "declined_opportunity":
      return "Sunuldu, seçilmedi";
    case "repeated_pattern_reached":
      return "Tekrar eden örüntü eşiği";
    case "recovery_signal_reached":
      return "Toparlanma sinyali";
    case "recovery_signal_withdrawn":
    default:
      return "Toparlanma sinyali geri alındı";
  }
}

/** Whether this entry is one of the derived milestones rather than a recorded
 *  event. The UI draws the two differently. */
export function isTimelineMilestone(entry: SemanticTimelineEntry): boolean {
  return KIND_RANK[entry.kind] === 1;
}

/** What an empty chronology should say. */
export function timelineAbsenceCopy(): { title: string; description: string } {
  return {
    title: "Bu etiket için kanıt geçmişi yok",
    description:
      "Yüklenen son öğrenme kayıtlarında bu ortak etikete bağlı bir seçim bulunmuyor.",
  };
}
