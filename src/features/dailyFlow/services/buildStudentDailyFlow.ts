import { StudentAssignmentCard } from "@features/assignments/hooks/useStudentAssignments";
import { TopicInsight } from "@features/study/services/learningInsights";

import { DailyFlowItem, MAX_DAILY_FLOW_ITEMS } from "./dailyFlowTypes";

// Phase 53 — "Bugün ne yapmalıyım?", composed from evidence the app already
// has. Pure, deterministic, Firebase/React-free.
//
// WHAT THIS IS NOT
//
// It is not a second next-action engine. Phase 39's resolveStudentNextAction
// already answers "the ONE next thing" for the Study Hub, and it keeps doing
// that, unchanged. This composer answers a different question — "the small
// handful of things worth doing today" — from the SAME underlying signals,
// in the SAME priority order, so the two can never contradict each other.
//
// PRIORITY LADDER (§10, mirroring Phase 39's own order)
//
//   0  an assignment that is genuinely still open
//   1  reviews that are actually due right now
//   2  a topic with real, trustworthy repeated-struggle evidence
//   3  ordinary practice, when there is real practice material
//
// Everything below is a structural fact about the data. There is no score,
// no weighting, and no randomness anywhere.

export interface StudentDailyFlowParams {
  assignmentCards: readonly StudentAssignmentCard[];
  // buildLearningInsights' already-ranked weak topics — never re-ranked
  // here. Re-ranking would be exactly the divergence-prone duplication
  // dailyPracticePlan.ts and studentNextAction.ts both avoid.
  weakTopics: readonly TopicInsight[];
  // How many study items are due right now, computed by the caller against
  // a fresh clock (see studyDueCheck.ts on why `now` must not be a memoized
  // value from an earlier render).
  dueCount: number;
  // Whether the student has any study history at all — separates "nothing
  // to do" from "brand new account", which need different empty copy.
  hasStudyHistory: boolean;
}

// An assignment counts as open when the student can still meaningfully act
// on it. "completed" is done; "past_due" is deliberately EXCLUDED from Daily
// Flow rather than surfaced as a scolding row — the student cannot change
// the outcome, and Phase 53 §50 forbids manufactured urgency. It remains
// fully visible in the assignments list.
function isOpenAssignment(card: StudentAssignmentCard): boolean {
  return card.status === "not_started" || card.status === "in_progress";
}

// The topic-level struggle evidence Daily Flow is allowed to act on.
//
// Phase 41's completeness rule, reused exactly: struggledAttemptCount is
// null whenever no question in the topic has trustworthy cumulative history,
// and null must stay unknown rather than becoming zero. A topic with null
// evidence therefore never produces a "you keep struggling here" row — the
// legacy/insufficient-data case (Student D) stays honest by construction.
function hasTrustworthyStruggleEvidence(topic: TopicInsight): boolean {
  return topic.struggledAttemptCount !== null && topic.struggledAttemptCount > 0;
}

// The single entry point. Returns at most MAX_DAILY_FLOW_ITEMS, already
// ordered, already deduplicated.
export function buildStudentDailyFlow(params: StudentDailyFlowParams): DailyFlowItem[] {
  const { assignmentCards, weakTopics, dueCount, hasStudyHistory } = params;
  const items: DailyFlowItem[] = [];

  // 0 — an assignment that is genuinely still open.
  //
  // Only ONE assignment row ever appears, even when several are open: three
  // near-identical assignment rows would crowd out every other kind of
  // signal and turn Daily Flow into an assignment list, which the
  // assignments screen already is. sortForStudent (useStudentAssignments)
  // has already put the most actionable one first, so this takes its
  // answer rather than re-sorting.
  const openAssignment = assignmentCards.find(isOpenAssignment);
  if (openAssignment) {
    const { assignment, status } = openAssignment;
    items.push({
      id: `assignment:${assignment.id}`,
      kind: "assignment",
      title: assignment.title,
      // Neutral, truthful, and deliberately time-free. §11/§12: no "due
      // soon", no "today", no minute estimate — the schema carries no
      // duration model, and dueAt is optional, so any such wording would be
      // invented.
      reason:
        status === "in_progress"
          ? "Başladın, kaldığın yerden devam edebilirsin."
          : undefined,
      actionLabel: status === "in_progress" ? "Devam Et" : "Ödeve Başla",
      target: { kind: "assignment", assignmentId: assignment.id },
      priority: 0,
    });
  }

  // 1 — reviews that are actually due right now. A real, scheduled
  // obligation the scheduler itself produced.
  if (dueCount > 0) {
    items.push({
      id: "due_review",
      kind: "due_review",
      title: "Tekrar zamanı geldi",
      reason: `${dueCount} soru tekrar edilmeyi bekliyor.`,
      actionLabel: "Tekrara Başla",
      target: { kind: "review_session" },
      priority: 1,
    });
  }

  // 2 — a topic with real repeated-struggle evidence.
  //
  // At most one, for the same crowding reason as assignments, and taken
  // from the head of an already-ranked list so the choice is deterministic.
  //
  // Gated on hasStudyHistory as well, which is an invariant rather than a
  // second rule: weak topics are DERIVED from study items, so a student with
  // no items cannot legitimately have one. Stating it here keeps the
  // composer correct rather than relying on the caller never passing that
  // contradictory pair.
  const struggleTopic = hasStudyHistory
    ? weakTopics.find(hasTrustworthyStruggleEvidence)
    : undefined;
  if (struggleTopic) {
    items.push({
      id: `reinforce:${struggleTopic.subject}:${struggleTopic.topic}`,
      kind: "reinforce_topic",
      title: `${struggleTopic.topic} konusunu güçlendir`,
      // The count is real (Phase 41 counters) and the sentence stays
      // supportive rather than accusatory (§13's "do not shame").
      reason: "Bu konuda birkaç kez zorlandın.",
      actionLabel: "Bu Konuyu Çalış",
      target: { kind: "question", questionId: struggleTopic.sampleQuestionId },
      priority: 2,
      isAttention: true,
    });
  }

  // 3 — ordinary practice.
  //
  // DEDUPE (§47): suppressed entirely once a reinforcement row exists. Both
  // rows would open practice off the same weak-topic evidence, and showing
  // "güçlendir" and "pratik yap" together is the exact duplicate pair §47
  // names. The stronger, more specific action wins.
  //
  // Also requires real history — a brand-new student with no study items at
  // all gets the first-run empty state instead of an adaptive session that
  // would have nothing in it.
  const hasReinforcement = items.some((item) => item.kind === "reinforce_topic");
  if (!hasReinforcement && hasStudyHistory && weakTopics.length > 0) {
    items.push({
      id: "practice",
      kind: "practice",
      title: "Bugünkü pratiğini yap",
      actionLabel: "Çalışmaya Başla",
      target: { kind: "adaptive_session" },
      priority: 3,
    });
  }

  // Stable by construction — items are pushed in ascending priority and
  // Array.prototype.sort is stable (guaranteed since ES2019), so equal
  // priorities keep insertion order and repeated calls with identical input
  // return an identical list (§49).
  return items.sort((a, b) => a.priority - b.priority).slice(0, MAX_DAILY_FLOW_ITEMS);
}
