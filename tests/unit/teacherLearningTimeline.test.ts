// Phase 60 — the teacher timeline's interpretation and honesty rules.
//
// The teacher-specific risk is overclaim: this section sits directly beside
// Phase 42's state and Phase 47's action, so a sentence that sounds like a
// verdict would quietly compete with them. These tests hold the line at
// "what the recorded sequence shows".

import {
  buildTeacherLearningTimeline,
  formatRelativeDayLabel,
  MAX_TIMELINE_TOPICS,
  TEACHER_TIMELINE_QUERY_LIMIT,
  timelineObservationText,
} from "../../src/features/learningStory/services/teacherLearningTimeline";
import { LearningEvent, MAX_TRAIL_EVENTS } from "../../src/features/learningStory/services/learningTrail";
import { StudyOutcome } from "../../src/features/study/domain/studyTypes";

const DAY = 24 * 60 * 60 * 1000;
// A fixed local noon, so day-boundary maths never straddles a real midnight
// while the suite runs.
const NOW = new Date(2026, 7, 31, 12, 0, 0).getTime();

function event(
  id: string,
  outcome: StudyOutcome,
  occurredAt: number,
  topic = "Denklemler",
  subject = "Matematik",
): LearningEvent {
  return { id, questionId: `q-${id}`, outcome, occurredAt, subject, topic };
}

function allCopy(timeline: ReturnType<typeof buildTeacherLearningTimeline>): string {
  return [timeline.observation ?? "", ...timeline.topics.map((t) => `${t.subject} ${t.topic}`)].join(" | ");
}

describe("formatRelativeDayLabel — calendar days, not elapsed hours", () => {
  it("labels the current calendar day Bugün", () => {
    expect(formatRelativeDayLabel(NOW - 60_000, NOW)).toBe("Bugün");
  });

  it("labels yesterday Dün even when barely any time has passed", () => {
    // 23:50 yesterday, read at 00:10 today: twenty minutes elapsed, but a
    // different calendar day. Elapsed-millisecond logic gets this wrong.
    const lateLastNight = new Date(2026, 7, 30, 23, 50, 0).getTime();
    const earlyToday = new Date(2026, 7, 31, 0, 10, 0).getTime();
    expect(formatRelativeDayLabel(lateLastNight, earlyToday)).toBe("Dün");
  });

  it("counts days for the recent past", () => {
    expect(formatRelativeDayLabel(NOW - 3 * DAY, NOW)).toBe("3 gün önce");
  });

  it("falls back to a date once a day count stops helping", () => {
    const label = formatRelativeDayLabel(NOW - 30 * DAY, NOW);
    expect(label).not.toMatch(/gün önce/);
    expect(label).toMatch(/\d/);
  });

  it("never renders a negative day count for slight clock skew", () => {
    expect(formatRelativeDayLabel(NOW + 60_000, NOW)).toBe("Bugün");
  });
});

describe("buildTeacherLearningTimeline — chronology", () => {
  it("orders each topic oldest to newest", () => {
    const timeline = buildTeacherLearningTimeline([
      event("c", "solved", NOW),
      event("a", "struggled", NOW - 2 * DAY),
      event("b", "struggled", NOW - DAY),
    ]);
    expect(timeline.topics[0]!.events.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("is deterministic for events sharing a timestamp", () => {
    const same = NOW - DAY;
    const forward = buildTeacherLearningTimeline([
      event("b", "solved", same),
      event("a", "struggled", same),
    ]);
    const reversed = buildTeacherLearningTimeline([
      event("a", "struggled", same),
      event("b", "solved", same),
    ]);
    expect(forward.topics[0]!.events.map((e) => e.id)).toEqual(["a", "b"]);
    expect(reversed.topics[0]!.events.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("keeps the most recent window, not the first events returned", () => {
    const many = Array.from({ length: MAX_TRAIL_EVENTS + 3 }, (_, i) =>
      event(`e${i}`, "solved", NOW - (MAX_TRAIL_EVENTS + 3 - i) * DAY),
    );
    const timeline = buildTeacherLearningTimeline(many);
    const shown = timeline.topics[0]!.events;
    expect(shown).toHaveLength(MAX_TRAIL_EVENTS);
    expect(shown[shown.length - 1]!.id).toBe(`e${MAX_TRAIL_EVENTS + 2}`);
  });
});

describe("buildTeacherLearningTimeline — topic grouping", () => {
  it("groups by topic and leads with the most recently active", () => {
    const timeline = buildTeacherLearningTimeline([
      event("old1", "struggled", NOW - 5 * DAY, "Kuvvet", "Fizik"),
      event("old2", "struggled", NOW - 4 * DAY, "Kuvvet", "Fizik"),
      event("new1", "struggled", NOW - DAY),
      event("new2", "solved", NOW),
    ]);
    expect(timeline.topics[0]!.topic).toBe("Denklemler");
    expect(timeline.topics[1]!.topic).toBe("Kuvvet");
  });

  it("caps how many topics are shown", () => {
    const events = ["A", "B", "C", "D"].flatMap((topic, i) => [
      event(`${topic}1`, "struggled", NOW - (10 - i) * DAY, topic),
      event(`${topic}2`, "solved", NOW - (9 - i) * DAY, topic),
    ]);
    expect(buildTeacherLearningTimeline(events).topics).toHaveLength(MAX_TIMELINE_TOPICS);
  });

  it("drops events whose question metadata never resolved", () => {
    const timeline = buildTeacherLearningTimeline([
      event("x", "struggled", NOW - DAY, "", ""),
      event("y", "solved", NOW, "", ""),
    ]);
    expect(timeline.topics).toHaveLength(0);
    expect(timeline.isEmpty).toBe(true);
  });

  it("reports empty for a student with no class events", () => {
    const timeline = buildTeacherLearningTimeline([]);
    expect(timeline.isEmpty).toBe(true);
    expect(timeline.observation).toBeNull();
  });
});

describe("buildTeacherLearningTimeline — observations", () => {
  it("reports a solve after struggles without calling it recovery of the student", () => {
    const timeline = buildTeacherLearningTimeline([
      event("a", "struggled", NOW - 2 * DAY),
      event("b", "struggled", NOW - DAY),
      event("c", "solved", NOW),
    ]);
    expect(timeline.topics[0]!.shape).toBe("recovery");
    expect(timeline.observation).toBe("Son kayıtlı sonuçta çözüm görülüyor.");
  });

  it("reports repeated struggle", () => {
    const timeline = buildTeacherLearningTimeline([
      event("a", "struggled", NOW - 2 * DAY),
      event("b", "struggled", NOW - DAY),
      event("c", "struggled", NOW),
    ]);
    expect(timeline.observation).toContain("zorlanma tekrar ediyor");
  });

  it("reports steady solving", () => {
    const timeline = buildTeacherLearningTimeline([
      event("a", "solved", NOW - 2 * DAY),
      event("b", "solved", NOW - DAY),
      event("c", "solved", NOW),
    ]);
    expect(timeline.observation).toContain("istikrarlı");
  });

  it("reports a mixed sequence as mixed", () => {
    const timeline = buildTeacherLearningTimeline([
      event("a", "solved", NOW - 2 * DAY),
      event("b", "again", NOW - DAY),
    ]);
    expect(timeline.observation).toContain("karışık");
  });

  it("offers no sentence for a single lone event", () => {
    const timeline = buildTeacherLearningTimeline([event("a", "struggled", NOW)]);
    // The event itself is still shown; only the trend sentence is withheld.
    expect(timeline.topics[0]!.events).toHaveLength(1);
    expect(timeline.topics[0]!.shape).toBeNull();
    expect(timeline.observation).toBeNull();
  });

  it("has no sentence when there is no shape", () => {
    expect(timelineObservationText(null)).toBeNull();
  });
});

describe("buildTeacherLearningTimeline — honesty", () => {
  const rich = [
    event("a", "struggled", NOW - 2 * DAY),
    event("b", "struggled", NOW - DAY),
    event("c", "solved", NOW),
    event("d", "solved", NOW - 3 * DAY, "Kuvvet", "Fizik"),
    event("e", "struggled", NOW - 2 * DAY, "Kuvvet", "Fizik"),
  ];

  it("never claims a cause", () => {
    const copy = allCopy(buildTeacherLearningTimeline(rich)).toLocaleLowerCase("tr");
    for (const claim of ["sayesinde", "işe yaradı", "neden oldu", "geliştirdi", "müdahale çalıştı"]) {
      expect(copy).not.toContain(claim);
    }
  });

  it("never claims a time window or a rate", () => {
    const copy = allCopy(buildTeacherLearningTimeline(rich)).toLocaleLowerCase("tr");
    for (const phrase of ["bu hafta", "geçen hafta", "son 7 gün", "%", "başarı oranı"]) {
      expect(copy).not.toContain(phrase);
    }
  });

  it("never promotes a sequence into a Phase 42 verdict", () => {
    const copy = allCopy(buildTeacherLearningTimeline(rich)).toLocaleLowerCase("tr");
    // The state vocabulary belongs to Phase 42; the timeline only describes
    // what the recorded outcomes show.
    for (const verdict of ["öğrenci gelişiyor", "toparlandı", "artık sorun yok", "durumu iyileşti"]) {
      expect(copy).not.toContain(verdict);
    }
  });

  it("never leaks implementation terms", () => {
    const copy = allCopy(buildTeacherLearningTimeline(rich));
    for (const leak of [
      "persistent_struggle",
      "recovering",
      "repeated_struggle",
      "sourceClassId",
      "operationId",
      "schemaVersion",
      "studyEvents",
      "struggledCount",
      "occurredAt",
    ]) {
      expect(copy).not.toContain(leak);
    }
  });

  it("never states a coverage percentage", () => {
    expect(allCopy(buildTeacherLearningTimeline(rich))).not.toMatch(/%\s*\d/);
  });
});

describe("query bounds", () => {
  it("asks for a bounded, documented number of events", () => {
    expect(TEACHER_TIMELINE_QUERY_LIMIT).toBe(20);
  });
});
