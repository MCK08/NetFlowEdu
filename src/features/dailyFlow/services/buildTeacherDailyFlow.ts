import { ClassTopicHotspot } from "@features/teacher/services/classTopicInsights";
import { StudentAttentionCard } from "@features/teacher/services/studentAttention";

import { DailyFlowItem, MAX_DAILY_FLOW_ITEMS } from "./dailyFlowTypes";

// Phase 53 — "Bugün neye dikkat etmeliyim?", composed from the teacher
// intelligence that is ALREADY aggregated for the class. Pure,
// deterministic, Firebase/React-free.
//
// WHY PHASE 47's improved / no_change / worsened DOES NOT APPEAR HERE
//
// This is the one place Phase 53's suggested priority ladder could not be
// implemented as written, and the reason is architectural rather than a
// shortcut.
//
// Those verdicts come from buildInterventionEffectiveness, which needs, PER
// STUDENT, that student's most recent intervention assignment plus their own
// submission document (see useInterventionEffectiveness: two reads each).
// Producing them for a class of N students on every teacher feed open is
// exactly the per-student fan-out §22 forbids and Phase 50 deliberately
// avoided. There is no aggregated source for them today.
//
// So Daily Flow surfaces the signals that ARE already aggregated
// (studentAttention's category + reasons, and the class topic hotspots),
// and the effectiveness verdict plus its Phase 47 next action stay exactly
// where they already live and are already computed for a single student:
// Student Performance, which every row here links into. Phase 47's
// semantics are therefore consumed unchanged and never re-derived, and
// nothing is fabricated to fill the ladder.
//
// PRIORITY LADDER
//
//   0  a student whose evidence says they need attention now
//   1  a second such student (attention is per-student and genuinely
//      parallel — two struggling students are two separate concerns)
//   2  a class-wide topic hotspot, which is one concern about many students

// Only categories there is actually something to DO about — the exact same
// needs_attention/watch rule buildTeacherActionSummary already applies to
// the dashboard's action list, and TeacherFeedScreen already applies to its
// signals channel. Reused, never re-derived.
function isActionableSignal(card: StudentAttentionCard): boolean {
  return card.insight.category === "needs_attention" || card.insight.category === "watch";
}

export interface TeacherDailyFlowParams {
  // Already sorted by studentAttention's own category-priority ordering —
  // never re-sorted here (§49's "reuse trustworthy existing evidence
  // ordering").
  attentionCards: readonly StudentAttentionCard[];
  topicHotspots: readonly ClassTopicHotspot[];
  // The class these signals belong to. Null when the teacher has no class
  // yet, in which case there is nothing to route to and Daily Flow stays
  // empty rather than rendering rows that cannot open anything.
  classId: string | null;
}

// How many per-student rows may appear before the class-level row gets its
// turn. Two, so a hotspot can still surface alongside the most urgent
// students rather than always being pushed off the end.
const MAX_STUDENT_SIGNALS = 2;

export function buildTeacherDailyFlow(params: TeacherDailyFlowParams): DailyFlowItem[] {
  const { attentionCards, topicHotspots, classId } = params;
  if (!classId) return [];

  const items: DailyFlowItem[] = [];

  const actionable = attentionCards.filter(isActionableSignal);
  for (const card of actionable.slice(0, MAX_STUDENT_SIGNALS)) {
    items.push({
      id: `student:${card.studentUid}`,
      kind: "student_signal",
      title: card.displayName,
      // studentAttention.ts's own fixed reason sentence, verbatim. It is
      // already observational and already evidence-backed; rewriting it here
      // would risk drifting into the causal claims §20 forbids.
      //
      // DEDUPE (§48): one row per student carrying that student's one
      // reason — never a separate "persistently struggling" row and
      // "needs intervention" row for the same underlying concern.
      reason: card.insight.reasons[0],
      actionLabel: "Öğrenciyi İncele",
      target: { kind: "student_performance", classId, studentUid: card.studentUid },
      priority: items.length,
      isAttention: card.insight.category === "needs_attention",
    });
  }

  // A class-wide hotspot — one concern about many students, so it sits
  // below the individual ones rather than competing with them.
  //
  // Routed to the assignment composer prefilled from the hotspot's own real
  // metadata. gradeLevel is passed through as-is including null: Phase 43's
  // rule is that an unresolvable grade is OMITTED by the caller, never
  // defaulted, because a confidently-wrong grade silently changes which
  // questions get selected.
  const hotspot = topicHotspots[0];
  if (hotspot && items.length < MAX_DAILY_FLOW_ITEMS) {
    items.push({
      id: `hotspot:${hotspot.subject}:${hotspot.topic}`,
      kind: "topic_hotspot",
      title: `${hotspot.subject} · ${hotspot.topic}`,
      reason: `${hotspot.strugglingStudents} öğrencide zorlanma görülüyor.`,
      actionLabel: "Ödev Oluştur",
      target: {
        kind: "assignment_composer",
        classId,
        subject: hotspot.subject,
        topic: hotspot.topic,
        gradeLevel: hotspot.gradeLevel,
      },
      priority: MAX_STUDENT_SIGNALS,
      isAttention: false,
    });
  }

  return items.sort((a, b) => a.priority - b.priority).slice(0, MAX_DAILY_FLOW_ITEMS);
}
