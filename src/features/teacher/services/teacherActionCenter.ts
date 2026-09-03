import { InterventionEffectivenessResult } from "./interventionEffectiveness";
import { PostInterventionAction, PostInterventionActionKind } from "./postInterventionAction";
import { TeacherAction } from "./teacherActionSummary";

// Phase 73 — "bugün kimi kontrol etmeliyim?", in one place.
//
// THE GAP THIS CLOSES
//
// Phase 47's post-intervention verdicts already existed, but only on
// StudentPerformanceScreen — a teacher had to open each student in turn to
// discover that one of them had regressed after an intervention. The class
// surface showed topic hotspots and attention students (Phase 27/43) and
// nothing about follow-ups at all.
//
// So this MERGES two existing, already-canonical lists rather than inventing a
// third ranking. Phase 47 decides what an intervention outcome means;
// buildTeacherActionSummary decides which hotspots and students are worth
// surfacing; this only interleaves them in a defensible order.
//
// NO SCORES
//
// There is no priorityScore, no urgency percentage and no risk figure. Order
// comes from a fixed precedence over action kinds, then from the order the
// source lists were already sorted in.

export type TeacherActionCenterKind =
  // Phase 47 escalate — an intervention outcome went backwards, with real
  // confidence behind it.
  | "escalate"
  // Phase 47 follow_up — an intervention outcome did not change, with real
  // confidence behind it.
  | "follow_up"
  // Phase 27/43 — a topic hotspot worth preparing an intervention for.
  | "prepare_intervention"
  // Phase 27/43 — a student worth looking at.
  | "review_student";

export interface TeacherActionCenterItem {
  /** Stable across renders. */
  id: string;
  kind: TeacherActionCenterKind;
  /** Who the action is about. Null for a topic-scoped action. */
  studentUid: string | null;
  /** The heading a teacher reads first: a student name, or a topic. */
  title: string;
  /** The topic this action concerns, when it has one. */
  topicContext: { subject: string; topic: string; gradeLevel: string | null } | null;
  /** Why this is being surfaced. Always canonical copy from the source
   *  service — never rewritten here. */
  reason: string;
  /** A short factual note about the intervention outcome, when one exists.
   *  Observational, never causal. */
  evidenceNote: string | null;
}

// A short "what to look at first" list, not a task manager. The full student
// list, the full hotspot list and each student's own screen all remain
// unchanged and fully available.
export const MAX_ACTION_CENTER_ITEMS = 5;

// Fixed precedence. Escalations first because a regression with real evidence
// behind it is the one thing a teacher would most regret missing; follow-ups
// next; then the existing hotspot/student actions in the order those lists
// already had.
const KIND_ORDER: Readonly<Record<TeacherActionCenterKind, number>> = {
  escalate: 0,
  follow_up: 1,
  prepare_intervention: 2,
  review_student: 3,
};

export interface StudentInterventionOutcome {
  studentUid: string;
  displayName: string;
  action: PostInterventionAction;
  result: InterventionEffectivenessResult;
}

// Phase 47's "monitor" is deliberately NOT an action here.
//
// Its own copy says so: "şu an için yeni bir takip ödevi önerilmiyor" and
// "şimdilik yeni bir aksiyon önerilmiyor". Listing it under "what should I do
// today" would contradict the verdict it carries. It stays fully visible on
// the student's own screen, where it answers a different question — "what
// happened after the intervention I ran?"
const SURFACED_KINDS: readonly PostInterventionActionKind[] = ["escalate", "follow_up"];

/** A short factual note about the outcome behind an action.
 *
 *  Observational only: it reports what the records show after the intervention,
 *  never that the intervention caused it. Phase 44 owns that distinction and
 *  this does not weaken it. */
function evidenceNoteFor(result: InterventionEffectivenessResult): string | null {
  const reviewed = result.reviewedSinceCount;
  if (reviewed <= 0) return null;
  return reviewed === 1
    ? "Müdahaleden sonra 1 soru tekrar edildi."
    : `Müdahaleden sonra ${reviewed} soru tekrar edildi.`;
}

/** The class's action list: Phase 47 outcomes first, then the existing
 *  hotspot/student actions.
 *
 *  Pure and deterministic — same inputs always produce the same list in the
 *  same order. */
export function buildTeacherActionCenter(params: {
  outcomes: readonly StudentInterventionOutcome[];
  /** buildTeacherActionSummary's output, already sorted by its own rules. */
  summaryActions: readonly TeacherAction[];
}): TeacherActionCenterItem[] {
  const items: TeacherActionCenterItem[] = [];
  const seenStudents = new Set<string>();

  for (const outcome of params.outcomes) {
    if (!SURFACED_KINDS.includes(outcome.action.kind)) continue;
    // One action per student: a teacher who is told to look at someone does
    // not also need to be told to look at them again further down.
    if (seenStudents.has(outcome.studentUid)) continue;
    seenStudents.add(outcome.studentUid);
    items.push({
      id: `${outcome.action.kind}|${outcome.studentUid}`,
      kind: outcome.action.kind as TeacherActionCenterKind,
      studentUid: outcome.studentUid,
      title: outcome.displayName,
      topicContext: null,
      // Phase 47's own fixed copy, carried through unchanged.
      reason: outcome.action.reason,
      evidenceNote: evidenceNoteFor(outcome.result),
    });
  }

  for (const action of params.summaryActions) {
    if (action.kind === "open_student") {
      if (action.studentUid && seenStudents.has(action.studentUid)) continue;
      if (action.studentUid) seenStudents.add(action.studentUid);
      items.push({
        id: `review_student|${action.studentUid ?? action.title}`,
        kind: "review_student",
        studentUid: action.studentUid,
        title: action.title,
        topicContext: action.topicContext,
        reason: action.reason,
        evidenceNote: null,
      });
      continue;
    }
    items.push({
      id: `prepare_intervention|${action.topicContext?.subject ?? ""}|${action.topicContext?.topic ?? action.title}`,
      kind: "prepare_intervention",
      studentUid: null,
      title: action.title,
      topicContext: action.topicContext,
      reason: action.reason,
      evidenceNote: null,
    });
  }

  // Stable sort by kind only — every source list arrived already ordered by
  // its own rules, and Array.prototype.sort is stable, so those orders survive
  // inside each kind without a second ranking being invented here.
  items.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);

  return items.slice(0, MAX_ACTION_CENTER_ITEMS);
}

// Section headings a teacher reads. Derived from the action kind, never the
// raw enum.
const KIND_LABEL: Readonly<Record<TeacherActionCenterKind, string>> = {
  escalate: "Öncelikli inceleme",
  follow_up: "Takip gerekli",
  prepare_intervention: "Müdahale öneriliyor",
  review_student: "İzle",
};

export function actionCenterLabel(item: TeacherActionCenterItem): string {
  return KIND_LABEL[item.kind];
}

/** What the class surface says when nothing stands out.
 *
 *  Deliberately not "the whole class is fine": students with no trustworthy
 *  evidence are invisible to every signal behind this list, so claiming they
 *  are doing well would be a statement the records cannot support. */
export const ACTION_CENTER_EMPTY_COPY =
  "Şu anda öne çıkan bir öğretmen aksiyonu yok.";
