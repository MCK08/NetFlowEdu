import { LearningEvent } from "@features/learningStory/services/learningTrail";
import {
  buildVerifiedChoicePatterns,
  VerifiedChoicePattern,
} from "@features/study/services/verifiedChoicePatterns";

import { InterventionCandidate, resolveTopicInterventionTargets } from "./teacherIntervention";

// Phase 81 — where SEVERAL students independently show the same shared
// authored selection pattern.
//
// WHAT A COHORT IS
//
// Two or more students who each, on their own, already satisfy Phase 78's
// repeated-pattern contract for the SAME canonical shared definition, in the
// same subject and topic. Nothing here lowers that bar; it only asks how many
// people cleared it separately.
//
// WHAT A COHORT IS NOT
//
// Not an intervention list. A cohort says several students met the same
// authored meaning more than once — it says nothing about whether any of them
// needs a teacher to act. Phase 42 classifies, Phase 43 decides who is
// targetable, and both remain untouched by everything in this file. The
// ACTION-READY subset below is an intersection with Phase 43's own answer, not
// a second opinion about it.
//
// WHY RAW POOLING IS REFUSED
//
// One selection from student A plus one from student B is two events and zero
// evidence. Pooling them would manufacture a class pattern out of two
// unrelated moments, and it is the single easiest way for this feature to
// start lying. Every student is qualified ALONE first, by the canonical
// classifier, and only the survivors are counted.
//
// WHY PRIVATE SEMANTICS ARE EXCLUDED ENTIRELY
//
// An author-scoped conceptKey is one person's private vocabulary. Phase 80
// exists precisely because grouping across people needs an identity someone
// deliberately declared as shared, and reaching back for private keys here —
// even when the same teacher wrote every question, even when the strings match
// exactly — would quietly re-invent the label matching Phase 80 refused.
//
// The cost is real: this surface stays empty until a class actually uses
// shared definitions. Correct and sparse beats full and unfounded.

/** Two. A pattern one student shows is already told, better and individually,
 *  by Phase 78 on that student's own screen — what is new at class level is
 *  that it is not just them. */
export const MIN_COHORT_STUDENTS = 2;

/** How many cohorts the teacher surface shows. Small for the same reason the
 *  student's own pattern list is: this is a place to notice something, not a
 *  report to work through. */
export const MAX_VISIBLE_SEMANTIC_COHORTS = 4;

/** One student's bounded class events, already fetched and already joined to
 *  subject/topic by the caller. */
export interface ClassSemanticStudentEvidence {
  studentUid: string;
  displayName: string;
  events: readonly LearningEvent[];
}

/** One qualifying student inside a cohort. Every field is a count or a flag
 *  the canonical per-student classifier produced — nothing is re-derived. */
export interface ClassSemanticCohortMember {
  studentUid: string;
  displayName: string;
  /** That student's own qualifying selections of this meaning. */
  occurrenceCount: number;
  distinctQuestionCount: number;
  lastSeenAt: number;
  /** Phase 79 — this student currently shows declined-opportunity evidence.
   *  Not "resolved", and it never removes them from the cohort. */
  hasRecoverySignal: boolean;
  /** Phase 43 says this student is independently targetable in this exact
   *  subject and topic. Entirely separate evidence from everything above. */
  isActionReady: boolean;
}

export interface ClassSemanticCohort {
  /** Internal only. Carries the class id and the definition id, so it is a
   *  React key and never a rendered string. */
  id: string;
  subject: string;
  topic: string;
  /** The shared definition's authored label. Never generated, never a
   *  conceptKey, never an id — a cohort without one is not built at all. */
  label: string;
  /** Qualifying members, ordered for reading. */
  members: ClassSemanticCohortMember[];
  qualifyingStudentCount: number;
  /** Members with no current recovery evidence, and members with it. Two
   *  factual subsets of the same cohort, never two verdicts. */
  activeRepeatedStudentIds: string[];
  recoverySignalStudentIds: string[];
  /** The UNION of the questions behind every member's pattern. Two students
   *  who both repeated on the same question contribute one question, not two. */
  distinctQuestionCount: number;
  /** Most recent qualifying selection anywhere in the cohort. */
  lastSeenAt: number;
  /** The intersection with Phase 43. Often empty, and an empty one is a normal
   *  result rather than a gap to fill. */
  actionReadyStudentIds: string[];
}

export interface ClassSemanticCohortSummary {
  cohorts: ClassSemanticCohort[];
  /** Students who qualified individually for at least one SHARED meaning,
   *  whether or not anyone joined them. Separates "nobody repeated a shared
   *  meaning yet" from "people did, but never the same one" — two different
   *  sentences for the teacher. */
  qualifyingStudentCount: number;
  isEmpty: boolean;
}

interface Accumulator {
  id: string;
  subject: string;
  topic: string;
  label: string;
  labelAt: number;
  lastSeenAt: number;
  members: ClassSemanticCohortMember[];
  questions: Set<string>;
}

/** Whether one student's pattern may take part in a CLASS cohort.
 *
 *  Three refusals, in order:
 *
 *   · not class-scoped — a private conceptKey never leaves its author's
 *     namespace, which is the whole scope correction this phase rests on;
 *   · a different class's namespace — structurally unreachable today, because
 *     the events were already filtered by `sourceClassId` and Phase 80 derives
 *     a shared scope from the question's own `classId`. Checked anyway: it
 *     costs one comparison, and it means cross-class contamination stays
 *     impossible even if that coupling is ever changed somewhere else;
 *   · no authored label — a shared definition is only worth surfacing as a
 *     shared instructional focus if someone wrote words for it. Falling back to
 *     the definition id would put an opaque token in front of a teacher. */
function participates(pattern: VerifiedChoicePattern, classId: string): boolean {
  if (pattern.identity.namespaceKind !== "class") return false;
  if (pattern.identity.namespaceId !== classId) return false;
  if (!pattern.label) return false;
  return true;
}

/** The class's shared semantic cohorts.
 *
 *  Pure: no Firebase, no clock, no randomness. The per-student qualification
 *  is delegated wholesale to Phase 78/79's `buildVerifiedChoicePatterns`, so
 *  there is exactly one implementation of "repeated" and one of "recovering"
 *  in the product, and this file cannot drift from them.
 *
 *  Complexity: O(S · E · P) for the per-student classifier Phase 78 already
 *  runs (E is the bounded per-student event window, P that student's distinct
 *  meanings in it), plus O(M) to group the surviving patterns and
 *  O(C log C) to order the cohorts. No pass is quadratic in class size. */
export function buildClassSemanticCohorts(params: {
  classId: string;
  students: readonly ClassSemanticStudentEvidence[];
  /** Phase 43's OWN inputs, passed straight through. Reusing the canonical
   *  resolver rather than reading a learning state here is what keeps this
   *  file from becoming a second opinion on who is targetable. */
  interventionCandidates: readonly InterventionCandidate[];
}): ClassSemanticCohortSummary {
  const groups = new Map<string, Accumulator>();
  const qualifyingStudents = new Set<string>();

  for (const student of params.students) {
    // The canonical classifier, uncapped: the display limit above it is about
    // one student's reflective list and must not decide class membership.
    const memory = buildVerifiedChoicePatterns({
      events: student.events,
      maxPatterns: Number.POSITIVE_INFINITY,
    });

    for (const pattern of memory.patterns) {
      if (!participates(pattern, params.classId)) continue;
      qualifyingStudents.add(student.studentUid);

      let group = groups.get(pattern.id);
      if (!group) {
        group = {
          id: pattern.id,
          subject: pattern.subject,
          topic: pattern.topic,
          label: pattern.label!,
          labelAt: pattern.lastSeenAt,
          lastSeenAt: pattern.lastSeenAt,
          members: [],
          questions: new Set(),
        };
        groups.set(pattern.id, group);
      }

      // The wording that was current most recently anywhere in the class —
      // the same rule one student's own pattern already applies to a renamed
      // definition, lifted to the group.
      if (pattern.lastSeenAt >= group.labelAt) {
        group.label = pattern.label!;
        group.labelAt = pattern.lastSeenAt;
      }
      if (pattern.lastSeenAt > group.lastSeenAt) group.lastSeenAt = pattern.lastSeenAt;

      for (const questionId of pattern.questionIds) group.questions.add(questionId);

      group.members.push({
        studentUid: student.studentUid,
        displayName: student.displayName,
        occurrenceCount: pattern.occurrenceCount,
        distinctQuestionCount: pattern.distinctQuestionCount,
        lastSeenAt: pattern.lastSeenAt,
        hasRecoverySignal: pattern.recovery !== null,
        // Filled in below, once the cohort's subject/topic are settled.
        isActionReady: false,
      });
    }
  }

  const cohorts: ClassSemanticCohort[] = [];
  for (const group of groups.values()) {
    if (group.members.length < MIN_COHORT_STUDENTS) continue;

    // Phase 43, unmodified and unconsulted until now. It answers a question
    // this file never asks itself: who is independently targetable in THIS
    // exact subject and topic. A student may be in the cohort and not here,
    // or here and not in the cohort — the two are different evidence.
    const targetable = new Set(
      resolveTopicInterventionTargets(params.interventionCandidates, group.subject, group.topic),
    );

    const members = group.members.map((member) => ({
      ...member,
      isActionReady: targetable.has(member.studentUid),
    }));

    // Reading order inside a cohort: still-repeating first, then the most
    // recent evidence, then the name. Deliberately NOT action-ready first —
    // that would rank people by how much a teacher should worry about them,
    // which is exactly the score this phase refuses to invent.
    members.sort((a, b) => {
      if (a.hasRecoverySignal !== b.hasRecoverySignal) return a.hasRecoverySignal ? 1 : -1;
      if (b.lastSeenAt !== a.lastSeenAt) return b.lastSeenAt - a.lastSeenAt;
      const byName = a.displayName.localeCompare(b.displayName, "tr");
      return byName !== 0 ? byName : a.studentUid.localeCompare(b.studentUid);
    });

    cohorts.push({
      id: group.id,
      subject: group.subject,
      topic: group.topic,
      label: group.label,
      members,
      qualifyingStudentCount: members.length,
      activeRepeatedStudentIds: members.filter((m) => !m.hasRecoverySignal).map((m) => m.studentUid),
      recoverySignalStudentIds: members.filter((m) => m.hasRecoverySignal).map((m) => m.studentUid),
      distinctQuestionCount: group.questions.size,
      lastSeenAt: group.lastSeenAt,
      // Sorted so the same class state always produces the same recipient
      // list — the convention resolveTopicInterventionTargets already follows
      // for exactly this reason.
      actionReadyStudentIds: members
        .filter((m) => m.isActionReady)
        .map((m) => m.studentUid)
        .sort((a, b) => a.localeCompare(b)),
    });
  }

  // Breadth of PEOPLE first: the one thing a class view can say that a student
  // view cannot is how many of them there are. Then recency, then how much of
  // the question pool is behind it, then the identity, so two runs over the
  // same evidence can never disagree. No weighted score anywhere.
  cohorts.sort((a, b) => {
    if (b.qualifyingStudentCount !== a.qualifyingStudentCount) {
      return b.qualifyingStudentCount - a.qualifyingStudentCount;
    }
    if (b.lastSeenAt !== a.lastSeenAt) return b.lastSeenAt - a.lastSeenAt;
    if (b.distinctQuestionCount !== a.distinctQuestionCount) {
      return b.distinctQuestionCount - a.distinctQuestionCount;
    }
    return a.id.localeCompare(b.id);
  });

  const visible = cohorts.slice(0, MAX_VISIBLE_SEMANTIC_COHORTS);
  return {
    cohorts: visible,
    qualifyingStudentCount: qualifyingStudents.size,
    isEmpty: visible.length === 0,
  };
}

// Teacher-facing wording.
//
// Every line below states a count of real records. None of them describes a
// student: there is no "riskli", no "yanılgılı" and no "başarısız" here, and
// the closest this comes to a judgement is naming the topic an author already
// named.

/** The headline fact: how many people, across how many questions. */
export function cohortEvidenceLine(cohort: ClassSemanticCohort): string {
  return `${cohort.qualifyingStudentCount} öğrenci · ${cohort.distinctQuestionCount} farklı soru`;
}

/** What the cohort means, said as carefully as the student-facing copy says
 *  it. "Aynı seçim örüntüsü" — the same selection pattern — and not "the same
 *  misconception", because the records show selections. */
export function cohortFact(cohort: ClassSemanticCohort): string {
  return `${cohort.qualifyingStudentCount} öğrencide aynı seçim örüntüsü ayrı ayrı doğrulandı.`;
}

/** The recovery fact, when part of the cohort currently shows one. Omitted
 *  entirely when nobody does — an absence is not a finding. */
export function cohortRecoveryFact(cohort: ClassSemanticCohort): string | null {
  const count = cohort.recoverySignalStudentIds.length;
  if (count === 0) return null;
  return `${count} öğrencide toparlanma sinyali var.`;
}

/** The Phase 43 fact, stated as the separate evidence it is.
 *
 *  "Ayrıca" is load-bearing: it marks this as a SECOND, independent finding
 *  about the same people rather than a consequence of the first. The semantic
 *  pattern did not make anyone persistent — Phase 42 did that on its own, from
 *  outcomes this feature never touches. */
export function cohortActionReadyFact(cohort: ClassSemanticCohort): string | null {
  const count = cohort.actionReadyStudentIds.length;
  if (count === 0) return null;
  return `${count} öğrenci bu konuda ayrıca tekrar eden zorlanma kanıtı taşıyor.`;
}

/** The marker shown for one member.
 *
 *  Initials from the display name the teacher already sees on this screen —
 *  never a uid, and never an index. Two letters where the name offers two, so
 *  five markers in a row stay distinguishable; the full name is always carried
 *  in the accessible label beside it, so nothing depends on decoding them. */
export function cohortMemberInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]!.slice(0, 1);
  const last = parts.length > 1 ? parts[parts.length - 1]!.slice(0, 1) : "";
  return `${first}${last}`.toLocaleUpperCase("tr");
}

/** Whether a small-group draft may be offered at all.
 *
 *  Two is the floor because one targetable student is not a group — that
 *  student's own screen already carries Phase 43's individual CTA, and
 *  routing them through a "group" composer would be the same action wearing a
 *  bigger word. */
export function canDraftSmallGroup(cohort: ClassSemanticCohort): boolean {
  return cohort.actionReadyStudentIds.length >= MIN_COHORT_STUDENTS;
}

/** What an empty surface should say.
 *
 *  Three genuinely different situations, and conflating them would be the
 *  usual dishonesty of empty states: "no cohort" is not "nothing is wrong",
 *  and neither is "nobody has used a shared label yet". */
export function cohortAbsenceCopy(summary: ClassSemanticCohortSummary): {
  title: string;
  description: string;
} {
  if (summary.qualifyingStudentCount >= MIN_COHORT_STUDENTS) {
    return {
      title: "Ortak bir örüntü henüz doğrulanmadı",
      description:
        "Öğrenciler ortak etiketli seçimleri tekrarladı, ancak aynı etiket üzerinde henüz birden fazla öğrenci buluşmadı.",
    };
  }
  if (summary.qualifyingStudentCount === 1) {
    return {
      title: "Şimdilik tek öğrencide görülüyor",
      description:
        "Bir öğrencide tekrar eden ortak etiketli seçim var. Sınıf örüntüsü için en az iki öğrenci gerekiyor.",
    };
  }
  return {
    title: "Ortak öğrenme örüntüsü için kanıt bekleniyor",
    description:
      "Sorularda ortak etiketler kullanıldıkça, birden fazla öğrencide tekrar eden seçim örüntüleri burada görünür.",
  };
}
