import { ClassTopicHotspot } from "./classTopicInsights";
import { StudentAttentionCard } from "./studentAttention";

// Turns Phase 27's two already-computed, already-sorted lists (topic
// hotspots, student attention) into a small, capped "what can I do right
// now" list. No new signal, no score, no percentage — every action is a
// direct reference to a real hotspot or a real student, using the priority
// order those lists were ALREADY built with (see classTopicInsights.ts's
// strugglingStudents-descending sort and studentAttention.ts's
// category-priority sort) rather than re-deriving a third ranking here.

export type TeacherActionKind = "create_question" | "open_student";

export interface TeacherAction {
  kind: TeacherActionKind;
  title: string;
  reason: string;
  // Present for create_question actions — the subject/topic to prefill the
  // composer with. Null for open_student actions.
  //
  // Phase 43 — carries the topic's own gradeLevel too, so an action started
  // from here opens the composer on the right grade. null when the topic's
  // questions do not agree on one (or when it came from a student's
  // implicated topic, which is not grade-scoped): the caller then omits the
  // parameter rather than sending a guess, since the composer would
  // otherwise silently fall back to the taxonomy's first grade.
  topicContext: { subject: string; topic: string; gradeLevel: string | null } | null;
  // Present for open_student actions. Null for create_question actions.
  studentUid: string | null;
}

// Small on purpose (§12 "dashboard'ı action listesine boğma") — this is a
// short "what to do first" list, not an exhaustive one; the full hotspot
// list and full student list are both still fully visible elsewhere on the
// screen.
export const MAX_TEACHER_ACTIONS = 4;

function topicKey(subject: string, topic: string): string {
  return `${subject}__${topic}`;
}

// Priority (§13): every real topic hotspot first (already the class's most
// struggled-with topics, most-struggling first), THEN students in
// needs_attention/watch (already sorted needs_attention-before-watch,
// lowest-success-first, name as final tiebreak by studentAttention.ts) —
// "progressing"/"strong"/"insufficient_data" students never appear here;
// there is nothing urgent to DO about them, only to look at (still fully
// visible in the main student list, unaffected by this).
export function buildTeacherActionSummary(
  topicHotspots: readonly ClassTopicHotspot[],
  attentionCards: readonly StudentAttentionCard[],
): TeacherAction[] {
  const actions: TeacherAction[] = [];
  const seenTopics = new Set<string>();

  for (const hotspot of topicHotspots) {
    const key = topicKey(hotspot.subject, hotspot.topic);
    if (seenTopics.has(key)) continue;
    seenTopics.add(key);
    actions.push({
      kind: "create_question",
      title: `${hotspot.subject} · ${hotspot.topic}`,
      reason: `${hotspot.strugglingStudents} öğrencide zorlanma`,
      topicContext: {
        subject: hotspot.subject,
        topic: hotspot.topic,
        gradeLevel: hotspot.gradeLevel,
      },
      studentUid: null,
    });
  }

  for (const card of attentionCards) {
    if (card.insight.category !== "needs_attention" && card.insight.category !== "watch") continue;
    actions.push({
      kind: "open_student",
      title: card.displayName,
      reason: card.insight.reasons[0] ?? "",
      // A student's implicated topic carries no grade of its own (it comes
      // from the weak-topic ranking, not from question metadata), so this
      // stays null rather than borrowing an unrelated hotspot's grade.
      topicContext: card.insight.implicatedTopic
        ? { ...card.insight.implicatedTopic, gradeLevel: null }
        : null,
      studentUid: card.studentUid,
    });
  }

  return actions.slice(0, MAX_TEACHER_ACTIONS);
}
