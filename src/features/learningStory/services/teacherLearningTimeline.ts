import {
  LearningEvent,
  MAX_TRAIL_EVENTS,
  resolveTrailShape,
  sortEventsChronologically,
  TrailShape,
} from "./learningTrail";

// Phase 60 — the teacher's reading of the SAME Phase 59 events the student's
// Learning Trail is drawn from. Pure, deterministic, Firebase/React-free.
//
// WHY THIS IS NOT JUST THE STUDENT SERVICE
//
// The chronology is identical; the voice is not. learningTrail.ts speaks to
// the learner in the second person ("Bu konuda üst üste zorlandın"), which is
// wrong in a teacher's diagnostic context. Everything structural — ordering,
// tie-breaks, the shape resolution, the minimum-evidence bar — is REUSED from
// that module rather than reimplemented, so the two roles can never disagree
// about what the same events mean. Only the sentences differ.
//
// WHAT IT IS NOT ALLOWED TO DO
//
// It is not a classifier. Phase 42's learning state remains the authoritative
// verdict about a student, and Phase 47 remains the authority on what the
// teacher should do. A sequence ending in a solve is reported as exactly
// that — "son kayıtlı sonuçta çözüm görülüyor" — and never promoted into
// "this student is recovering", which is a claim only Phase 42 may make.
//
// It also never says "bu hafta" or quotes a rate. These events begin at Phase
// 59, so they cover a recent window of unknown completeness; the honest frame
// is "kayıtlı son sonuçlar", not a period the data cannot vouch for.

// How many recent events the teacher's bounded query asks for.
//
// Deliberately smaller than the student's MAX_RECENT_EVENTS (40): the teacher
// view shows at most two topic trails of MAX_TRAIL_EVENTS each, so 20 is
// already several times more than can be displayed, while leaving enough
// history for the topic grouping below to pick from. It halves the read
// against a lifetime-heavy student for no loss of information.
export const TEACHER_TIMELINE_QUERY_LIMIT = 20;

// How many topics may show a trail. One topic is the common case; a second is
// allowed when a student is genuinely working across two areas. Beyond that
// the section stops being a story and becomes the confusing multi-subject
// chain §18 rules out.
export const MAX_TIMELINE_TOPICS = 2;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
// Past this, a relative day count stops being easier to read than a date.
const MAX_RELATIVE_DAYS = 6;

function startOfLocalDay(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

// "Bugün" / "Dün" / "N gün önce" / an absolute date.
//
// Compared by LOCAL CALENDAR DAY, not by elapsed milliseconds: an outcome
// recorded at 23:50 and read at 00:10 is "Dün", even though barely twenty
// minutes have passed. `formatRelativeTime` (feedFormat.ts) is elapsed-based
// and deliberately not reused here for that reason; the calendar boundary is
// the whole point of a day label.
export function formatRelativeDayLabel(occurredAt: number, now: number = Date.now()): string {
  const day = startOfLocalDay(occurredAt);
  const today = startOfLocalDay(now);
  const daysAgo = Math.round((today - day) / ONE_DAY_MS);

  if (daysAgo <= 0) return "Bugün";
  if (daysAgo === 1) return "Dün";
  if (daysAgo <= MAX_RELATIVE_DAYS) return `${daysAgo} gün önce`;
  return new Date(occurredAt).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "long",
  });
}

export interface TimelineTopic {
  // Stable across renders: derived from subject+topic, never an index.
  id: string;
  subject: string;
  topic: string;
  // Oldest → newest, capped at MAX_TRAIL_EVENTS. Same direction the student's
  // trail uses, so a sequence reads the same way in both roles.
  events: LearningEvent[];
  shape: TrailShape | null;
}

export interface TeacherLearningTimeline {
  topics: TimelineTopic[];
  // One observational sentence about the most relevant topic's shape, or null
  // when the evidence does not support any sentence at all.
  observation: string | null;
  // True when the class has produced no chronological events for this student
  // yet — the normal state for a legacy account, and NOT a claim that the
  // student has never studied.
  isEmpty: boolean;
}

// Fixed teacher-voiced copy. Observational and third-person throughout: each
// sentence reports what the recorded sequence shows, never why it happened
// and never what it predicts.
const SHAPE_OBSERVATION: Readonly<Record<TrailShape, string>> = {
  recovery: "Son kayıtlı sonuçta çözüm görülüyor.",
  repeated_struggle: "Son kayıtlı çalışmalarda zorlanma tekrar ediyor.",
  steady: "Son kayıtlı çalışmalarda çözüm istikrarlı görünüyor.",
  mixed: "Son kayıtlı sonuçlar karışık bir görünüm gösteriyor.",
};

export function timelineObservationText(shape: TrailShape | null): string | null {
  return shape ? SHAPE_OBSERVATION[shape] : null;
}

/** Groups events into per-topic trails, most recently active topic first.
 *
 *  Events whose question metadata could not be resolved carry "" for subject
 *  and topic (learningInsights.ts's convention). They are dropped rather than
 *  bucketed together: an unnamed group tells the teacher nothing and would mix
 *  unrelated questions into one misleading chain. */
export function buildTeacherLearningTimeline(
  events: readonly LearningEvent[],
): TeacherLearningTimeline {
  const groups = new Map<string, LearningEvent[]>();

  for (const event of events) {
    if (!event.subject || !event.topic) continue;
    const key = `${event.subject}|${event.topic}`;
    const existing = groups.get(key);
    if (existing) {
      existing.push(event);
    } else {
      groups.set(key, [event]);
    }
  }

  const topics: TimelineTopic[] = [];
  for (const [id, groupEvents] of groups) {
    const ordered = sortEventsChronologically(groupEvents);
    // The most recent window, matching the student trail's own cap.
    const windowed = ordered.slice(-MAX_TRAIL_EVENTS);
    const [subject = "", topic = ""] = id.split("|");
    topics.push({
      id,
      subject,
      topic,
      events: windowed,
      // resolveTrailShape enforces the shared minimum-evidence bar, so a
      // single lone event yields null and no sentence is offered for it.
      shape: resolveTrailShape(windowed),
    });
  }

  // Most recently active topic first. The tie-break is the topic id so two
  // topics whose latest events share a millisecond cannot swap between
  // renders — the same determinism rule the trail itself follows.
  topics.sort((a, b) => {
    const aLatest = a.events[a.events.length - 1]?.occurredAt ?? 0;
    const bLatest = b.events[b.events.length - 1]?.occurredAt ?? 0;
    if (aLatest !== bLatest) return bLatest - aLatest;
    return a.id.localeCompare(b.id);
  });

  const visible = topics.slice(0, MAX_TIMELINE_TOPICS);

  return {
    topics: visible,
    // The headline observation describes the most recently active topic —
    // the one the teacher is most likely asking about — rather than blending
    // several topics into a single verdict none of them supports.
    observation: timelineObservationText(visible[0]?.shape ?? null),
    isEmpty: visible.length === 0,
  };
}
