import { TopicInsight } from "@features/study/services/learningInsights";

// Aggregates ACROSS students' already-computed, per-student TopicInsight
// arrays (StudentPerformanceSnapshot.allTopics — itself the existing
// Phase 22/25 learning engine's own output, one call per student, already
// made by useClassPerformance) into a class-wide "where does this class
// struggle" view. No new signal, no new Firestore read, no percentage —
// only real counts, per the phase brief's own "use counts when possible"
// instruction: a percentage over a variable, small, teacher-unaware
// denominator (how many students have even attempted this topic) is
// exactly the kind of unreliable-denominator number that instruction warns
// against.

export interface ClassTopicHotspot {
  subject: string;
  topic: string;
  // Distinct students with at least one class-sourced item in this topic.
  studentsWithAttempts: number;
  // Distinct students with at least one real struggled outcome in this
  // topic (their own per-student TopicInsight.struggledCount > 0).
  strugglingStudents: number;
  // Phase 42 — the total number of struggled OUTCOMES this class recorded
  // in this topic, summed from each student's own
  // TopicInsight.struggledAttemptCount (Phase 41's server counters).
  //
  // A count of EVENTS, unlike strugglingStudents above which counts
  // PEOPLE: five students who each struggled once and five students who
  // each struggled eight times produce the same strugglingStudents (5) and
  // were previously indistinguishable here.
  //
  // null — never 0 — when no contributing student has trustworthy
  // cumulative history for this topic (e.g. every item predates the
  // counters). Deliberately NOT part of the sort below; see the ranking
  // note there.
  struggledAttemptCount: number | null;
  // Distinct students whose per-student mastery band for this topic is
  // "mastered" — the server-derived verdict topicMastery.ts already
  // produces, never a second one.
  masteredStudents: number;
  // Distinct students with at least one currently-due item in this topic.
  dueStudents: number;
  // One representative question, deterministically the FIRST contributing
  // student's own sampleQuestionId in student-array order — a real,
  // already-selected-by-the-engine id, never invented.
  sampleQuestionId: string;
}

export interface StudentTopics {
  studentUid: string;
  allTopics: readonly TopicInsight[];
}

// How many hotspots the class-level view surfaces — same role
// MAX_RANKED_TOPICS plays for one student's weakTopics, kept as its own
// named constant since the two lists answer different questions (one
// student's weakest topics vs. the class's most-struggled-with topics) and
// have no reason to share a cap that later needs to change independently.
export const MAX_CLASS_TOPIC_HOTSPOTS = 5;

interface TopicAggregate {
  subject: string;
  topic: string;
  studentsWithAttempts: Set<string>;
  strugglingStudents: Set<string>;
  masteredStudents: Set<string>;
  dueStudents: Set<string>;
  sampleQuestionId: string;
  // Phase 42 — running total of struggled events, and whether ANY student
  // contributed a trustworthy count. The flag is what keeps "nobody has
  // usable history" (null) distinct from "the history says zero" (0).
  struggledAttemptTotal: number;
  hasStruggleAttemptEvidence: boolean;
}

function aggregateKey(subject: string, topic: string): string {
  return `${subject} ${topic}`;
}

// The class's full topic breakdown, uncapped — ranked by strugglingStudents
// descending (most students struggling first, which is the definition of
// "hotspot" here), then studentsWithAttempts descending (a topic more of
// the class has actually engaged with is more informative than one only
// one or two students have touched), then subject/topic alphabetically for
// a fully deterministic order on a complete tie.
export function buildClassTopicHotspots(
  studentsTopics: readonly StudentTopics[],
): ClassTopicHotspot[] {
  const aggregates = new Map<string, TopicAggregate>();

  for (const student of studentsTopics) {
    for (const topicInsight of student.allTopics) {
      if (topicInsight.subject === "" || topicInsight.topic === "") continue;
      const key = aggregateKey(topicInsight.subject, topicInsight.topic);
      const aggregate =
        aggregates.get(key) ??
        ({
          subject: topicInsight.subject,
          topic: topicInsight.topic,
          studentsWithAttempts: new Set(),
          strugglingStudents: new Set(),
          masteredStudents: new Set(),
          dueStudents: new Set(),
          sampleQuestionId: topicInsight.sampleQuestionId,
          struggledAttemptTotal: 0,
          hasStruggleAttemptEvidence: false,
        } satisfies TopicAggregate);

      if (topicInsight.totalCount > 0) aggregate.studentsWithAttempts.add(student.studentUid);
      if (topicInsight.struggledCount > 0) aggregate.strugglingStudents.add(student.studentUid);
      if (topicInsight.masteryBand === "mastered") aggregate.masteredStudents.add(student.studentUid);
      if (topicInsight.dueCount > 0) aggregate.dueStudents.add(student.studentUid);

      // Phase 42 — a student whose items all predate the counters
      // contributes nothing rather than a zero, so one legacy student can
      // never dilute a real class-wide event count.
      if (topicInsight.struggledAttemptCount !== null) {
        aggregate.struggledAttemptTotal += topicInsight.struggledAttemptCount;
        aggregate.hasStruggleAttemptEvidence = true;
      }

      aggregates.set(key, aggregate);
    }
  }

  return [...aggregates.values()]
    .map(
      (aggregate): ClassTopicHotspot => ({
        subject: aggregate.subject,
        topic: aggregate.topic,
        studentsWithAttempts: aggregate.studentsWithAttempts.size,
        strugglingStudents: aggregate.strugglingStudents.size,
        masteredStudents: aggregate.masteredStudents.size,
        dueStudents: aggregate.dueStudents.size,
        sampleQuestionId: aggregate.sampleQuestionId,
        struggledAttemptCount: aggregate.hasStruggleAttemptEvidence
          ? aggregate.struggledAttemptTotal
          : null,
      }),
    )
    // Phase 42 — the sort below is UNCHANGED on purpose. struggledAttemptCount
    // is additional EVIDENCE the teacher can read, not a new ranking key:
    // reordering the hotspot list would silently change what every teacher
    // sees first, mid-phase, with no evidence that event-count order serves
    // them better than people-affected order.
    .sort((a, b) => {
      if (a.strugglingStudents !== b.strugglingStudents) return b.strugglingStudents - a.strugglingStudents;
      if (a.studentsWithAttempts !== b.studentsWithAttempts) return b.studentsWithAttempts - a.studentsWithAttempts;
      const subjectDelta = a.subject.localeCompare(b.subject, "tr");
      if (subjectDelta !== 0) return subjectDelta;
      return a.topic.localeCompare(b.topic, "tr");
    })
    .filter((hotspot) => hotspot.strugglingStudents > 0)
    .slice(0, MAX_CLASS_TOPIC_HOTSPOTS);
}
