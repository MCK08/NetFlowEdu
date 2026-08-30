import { LearningInsightItem } from "@features/study/services/learningInsights";
import {
  buildLearningState,
  LearningState,
  MIN_OUTCOMES_FOR_CONFIDENT_STATE,
} from "@features/study/services/learningState";

import {
  LearningStoryEvidence,
  LearningStoryEvidenceLevel,
  LearningStoryMoment,
  LearningStoryMomentKind,
  StudentLearningStory,
} from "./learningStoryTypes";

// Phase 56 — turns the student's ALREADY-LOADED study evidence into a short,
// honest story. Pure and Firebase/React-free, so every rule below is directly
// testable.
//
// WHAT THIS DOES NOT DO
//
// It does not classify anything. Phase 42's buildLearningState is the single
// classifier and is called here unchanged; this file only decides which of
// its verdicts are worth telling the student about, in what order, and in
// what words. Re-deriving "is this a struggle" here would have created a
// second, quietly diverging definition of the same idea.
//
// WHY THERE IS NO TIME WINDOW
//
// The counters underneath (outcomeCounters.ts) are lifetime totals and carry
// no per-outcome timestamps, so "bu hafta" / "son 7 gün" / "%N daha iyi"
// cannot be said truthfully. `lastReviewedAt` would allow "when", but not
// "what changed since" — a single timestamp cannot establish a trend. The
// copy below therefore states composition and the single ordered fact the
// data really has: which outcome was most recent.

// A story, not a report: past roughly this many items the screen stops being
// a narrative and becomes the analytics wall this feature exists to avoid.
export const MAX_STORY_MOMENTS = 6;

// Narrative order (§14): what is going right first, then what is holding, then
// what needs work. Leading with a wall of struggle is both discouraging and a
// worse summary — the student already knows they struggled.
const KIND_ORDER: readonly LearningStoryMomentKind[] = [
  "recovery",
  "strength",
  "needs_attention",
  "one_off",
];

// Which per-question verdict wins when one topic's questions disagree.
// Unresolved struggle outranks everything: a topic with one recovering
// question and one still-failing question is not a recovery story yet.
const STATE_PRIORITY: readonly LearningState[] = [
  "persistent_struggle",
  "recovering",
  "one_off_struggle",
  "stable",
  "insufficient_data",
];

const KIND_BY_STATE: Partial<Record<LearningState, LearningStoryMomentKind>> = {
  persistent_struggle: "needs_attention",
  recovering: "recovery",
  one_off_struggle: "one_off",
  stable: "strength",
};

interface TopicGroup {
  subject: string;
  topic: string;
  items: LearningInsightItem[];
}

function groupKey(subject: string, topic: string): string {
  return `${subject}|${topic}`;
}

/** Groups by subject+topic, which is also the dedupe boundary (§35): one
 *  topic produces at most one moment, carrying both its insight and its
 *  action, rather than an "you are recovering" card followed by a separate
 *  "revise this" card derived from the very same evidence. */
function groupByTopic(items: LearningInsightItem[]): TopicGroup[] {
  const groups = new Map<string, TopicGroup>();
  for (const item of items) {
    const subject = item.subject.trim();
    const topic = item.topic.trim();
    // Legacy items carry "" for unresolved metadata (see LearningInsightItem).
    // A moment with no topic name has nothing to say and nowhere to route.
    if (!subject || !topic) continue;
    const key = groupKey(subject, topic);
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(key, { subject, topic, items: [item] });
    }
  }
  return [...groups.values()];
}

function statePriorityIndex(state: LearningState): number {
  const index = STATE_PRIORITY.indexOf(state);
  return index === -1 ? STATE_PRIORITY.length : index;
}

/** Sums the KNOWN outcome composition for a topic.
 *
 *  Returns null the moment any contributing question predates the cumulative
 *  counters. That is the Phase 41 completeness rule applied one level up: a
 *  partial sum would be presented as the topic's history while silently
 *  omitting the part that was never counted, which is exactly the "0% success
 *  rate" class of wrong number those counters were introduced to stop. */
function sumEvidence(items: LearningInsightItem[]): LearningStoryEvidence | null {
  let solved = 0;
  let struggled = 0;
  let again = 0;
  for (const item of items) {
    const history = item.outcomeHistory;
    if (!history) return null;
    solved += history.solvedCount;
    struggled += history.struggledCount;
    again += history.againCount;
  }
  const total = solved + struggled + again;
  if (total === 0) return null;
  return { solved, struggled, again, total };
}

function evidenceLevelFor(evidence: LearningStoryEvidence): LearningStoryEvidenceLevel {
  return evidence.total >= MIN_OUTCOMES_FOR_CONFIDENT_STATE ? "strong" : "moderate";
}

// Fixed templates. Deliberately no internal classifier names
// ("persistent_struggle"), no field names ("struggledCount") and no invented
// numbers — a count only ever reaches the copy through `evidence`, which is
// null whenever any of it is unknown.
function describe(
  kind: LearningStoryMomentKind,
  evidence: LearningStoryEvidence,
): { title: string; description: string } {
  switch (kind) {
    case "recovery":
      return {
        title: "Bu konuda toparlanma görünüyor",
        description: `Bu konuda ${evidence.struggled} kez zorlandıktan sonra son denemeni çözdün.`,
      };
    case "strength":
      return {
        title: "Bu konu sağlam görünüyor",
        description: `Kayıtlı ${evidence.total} denemenin ${evidence.solved} tanesini çözdün.`,
      };
    case "needs_attention":
      return {
        title: "Bu konu biraz daha tekrar istiyor",
        // "Bu konuda", never "aynı soruda": this count is summed across the
        // topic's questions, so claiming it happened on ONE question would
        // overstate what the evidence shows. The per-question phrasing
        // belongs to the classifier, not to a topic-level total.
        description: `Bu konuda ${evidence.struggled} kez zorlandın.`,
      };
    case "one_off":
      return {
        title: "Bir denemede zorlandın",
        description: "Şu an tekrar eden bir sorun görünmüyor.",
      };
  }
}

function actionLabelFor(kind: LearningStoryMomentKind): string | null {
  // At most one action per moment, and only where acting is the point.
  // "Bu konu sağlam" does not need a button telling the student to fix it.
  if (kind === "needs_attention") return "Bu Konuyu Çalış";
  if (kind === "recovery") return "Devam Et";
  return null;
}

function buildMoment(group: TopicGroup): LearningStoryMoment | null {
  const states = group.items.map((item) => ({
    item,
    state: buildLearningState({
      history: item.outcomeHistory ?? null,
      lastOutcome: item.lastOutcome,
      status: item.status,
      successfulReviews: item.successfulReviews,
    }),
  }));

  // The topic speaks with its most significant question's voice.
  // Deterministic tie-break on questionId so equal states never reorder
  // between renders.
  states.sort((a, b) => {
    const byState = statePriorityIndex(a.state) - statePriorityIndex(b.state);
    if (byState !== 0) return byState;
    return a.item.questionId.localeCompare(b.item.questionId);
  });

  const leading = states[0];
  // A group only exists because groupByTopic put an item in it, so this is
  // structurally non-empty; the guard keeps that assumption checked rather
  // than asserted.
  if (!leading) return null;
  const kind = KIND_BY_STATE[leading.state];
  // insufficient_data deliberately produces NO moment (§12): "we cannot say
  // anything about this yet" is not a story beat, and rendering it as one
  // would fill a new student's screen with cards about nothing.
  if (!kind) return null;

  // Evidence is summed only over the questions that actually support the
  // verdict being told, so a topic's "recovering" line cannot borrow counts
  // from an unrelated stable question beside it.
  const contributing = states.filter((entry) => entry.state === leading.state).map((e) => e.item);

  // The topic's most RECENT attempt, not its most significant question.
  // "Son denemende çözdün" is a claim about chronology, and lastReviewedAt is
  // the one timestamp that can settle it; using the leading question instead
  // would report an older attempt as if it were the latest.
  const mostRecent = contributing.reduce((latest, item) =>
    item.lastReviewedAt > latest.lastReviewedAt ? item : latest,
  );
  const evidence = sumEvidence(contributing);
  // Defensive, and the last line of the honesty rule: Phase 42 will not
  // classify an item whose counters are incomplete, so this should already be
  // impossible — but if it ever becomes possible, the answer is to say
  // NOTHING about the topic rather than to describe it vaguely.
  if (!evidence) return null;
  const { title, description } = describe(kind, evidence);
  const label = actionLabelFor(kind);

  return {
    id: groupKey(group.subject, group.topic),
    kind,
    subject: group.subject,
    topic: group.topic,
    title,
    description,
    evidenceLevel: evidenceLevelFor(evidence),
    evidence,
    lastOutcome: mostRecent.lastOutcome,
    action: label ? { label, subject: group.subject, topic: group.topic } : null,
  };
}

function momentSortValue(moment: LearningStoryMoment): number {
  return KIND_ORDER.indexOf(moment.kind);
}

function headlineFor(moments: LearningStoryMoment[]): { headline: string; sub: string | null } {
  const recovering = moments.filter((m) => m.kind === "recovery").length;
  const attention = moments.filter((m) => m.kind === "needs_attention").length;
  const strong = moments.filter((m) => m.kind === "strength").length;

  // No score, no grade, no rank — a sentence about shape, not a number about
  // worth. Each branch below is only reachable when the counts it mentions
  // are real.
  if (recovering > 0) {
    return {
      headline: "Öğrenmen şekilleniyor",
      sub: `${recovering} konuda toparlanma görünüyor.`,
    };
  }
  if (strong > 0 && attention === 0) {
    return { headline: "İyi gidiyorsun", sub: `${strong} konu sağlam görünüyor.` };
  }
  if (attention > 0) {
    return {
      headline: "Çalışmaya devam",
      sub: `${attention} konu biraz daha tekrar istiyor.`,
    };
  }
  return { headline: "Öğrenmen şekilleniyor", sub: null };
}

export function buildStudentLearningStory(
  items: readonly LearningInsightItem[],
): StudentLearningStory {
  const moments = groupByTopic([...items])
    .map(buildMoment)
    .filter((moment): moment is LearningStoryMoment => moment !== null);

  moments.sort((a, b) => {
    const byKind = momentSortValue(a) - momentSortValue(b);
    if (byKind !== 0) return byKind;
    // Stronger evidence first inside a kind, then a stable alphabetical
    // tie-break: ordering must never depend on Firestore's return order.
    const byEvidence = b.evidence.total - a.evidence.total;
    if (byEvidence !== 0) return byEvidence;
    return a.id.localeCompare(b.id);
  });

  if (moments.length === 0) {
    return {
      headline: "İlerleme hikâyen ilk çalışmalarınla oluşacak",
      subheadline: null,
      moments: [],
      isFirstRun: true,
    };
  }

  const capped = moments.slice(0, MAX_STORY_MOMENTS);
  const { headline, sub } = headlineFor(capped);
  return { headline, subheadline: sub, moments: capped, isFirstRun: false };
}
