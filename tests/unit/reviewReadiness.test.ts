// Phase 62 — which topics the scheduler says are ready, and the separations
// that keep that claim honest.
//
// The tests that matter most are the ones proving this does NOT become a
// second scheduler: readiness comes from nextReviewAt alone, and no elapsed
// time of any size can make an item ready that the scheduler has not released.

import {
  buildReviewReadyTopics,
  MAX_REVIEW_TOPICS,
  reviewReadyReasonText,
} from "../../src/features/study/services/reviewReadiness";
import { buildChronologyProfiles } from "../../src/features/study/services/chronologyTieBreak";
import { LearningInsightItem } from "../../src/features/study/services/learningInsights";
import { LearningEvent } from "../../src/features/learningStory/services/learningTrail";
import { StudyOutcome } from "../../src/features/study/domain/studyTypes";

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function item(overrides: Partial<LearningInsightItem> = {}): LearningInsightItem {
  return {
    questionId: "q1",
    status: "review",
    lastOutcome: "solved",
    // Due by default; individual tests override to test the gate.
    nextReviewAt: NOW - DAY,
    subject: "Matematik",
    topic: "Denklemler",
    successfulReviews: 2,
    lastReviewedAt: NOW - 3 * DAY,
    outcomeHistory: { solvedCount: 4, struggledCount: 0, againCount: 0, knownOutcomeCount: 4 },
    ...overrides,
  };
}

// A recovering item: real struggle history, most recent outcome a standing solve.
function recovering(overrides: Partial<LearningInsightItem> = {}): LearningInsightItem {
  return item({
    lastOutcome: "solved",
    successfulReviews: 1,
    outcomeHistory: { solvedCount: 1, struggledCount: 3, againCount: 0, knownOutcomeCount: 4 },
    ...overrides,
  });
}

function persistentStruggle(overrides: Partial<LearningInsightItem> = {}): LearningInsightItem {
  return item({
    lastOutcome: "struggled",
    status: "learning",
    successfulReviews: 0,
    outcomeHistory: { solvedCount: 0, struggledCount: 4, againCount: 0, knownOutcomeCount: 4 },
    ...overrides,
  });
}

function build(items: LearningInsightItem[], events: LearningEvent[] = []) {
  return buildReviewReadyTopics({
    items,
    chronologyByQuestionId: buildChronologyProfiles(events),
    now: NOW,
  });
}

describe("review readiness — the scheduler is the authority", () => {
  it("never surfaces an item the scheduler has not released", () => {
    // Solved today: the scheduler gave it a long interval, so it is not due
    // however much the student might otherwise be 'ready'.
    const notDue = item({ nextReviewAt: NOW + 30 * DAY, lastReviewedAt: NOW });
    expect(build([notDue])).toHaveLength(0);
  });

  it("does not treat great age as readiness on its own", () => {
    // Last reviewed a year ago, but the scheduler still has it scheduled
    // ahead. There is no client-side threshold that can override that.
    const ancient = item({ lastReviewedAt: NOW - 365 * DAY, nextReviewAt: NOW + DAY });
    expect(build([ancient])).toHaveLength(0);
  });

  it("surfaces an item once the scheduler has released it", () => {
    expect(build([item({ nextReviewAt: NOW - DAY })])).toHaveLength(1);
  });

  it("respects the scheduler's mastery gate", () => {
    const mastered = item({ status: "mastered", nextReviewAt: NOW - 10 * DAY });
    expect(build([mastered])).toHaveLength(0);
  });
});

describe("review readiness — separations", () => {
  it("never labels persistent struggle as spaced review", () => {
    // This student needs active reinforcement (Phase 46), not a nudge that it
    // has been a while.
    expect(build([persistentStruggle()])).toHaveLength(0);
  });

  it("says nothing when the evidence is insufficient", () => {
    const thin = item({
      outcomeHistory: { solvedCount: 1, struggledCount: 0, againCount: 0, knownOutcomeCount: 1 },
      successfulReviews: 1,
    });
    expect(build([thin])).toHaveLength(0);
  });

  it("says nothing for a legacy item whose history was never counted", () => {
    // Student D's case: unknown lifetime evidence must not become a
    // confident review schedule.
    expect(build([item({ outcomeHistory: null })])).toHaveLength(0);
  });

  it("skips items whose topic metadata never resolved", () => {
    expect(build([item({ subject: "", topic: "" })])).toHaveLength(0);
  });
});

describe("review readiness — ordering", () => {
  it("puts a recovering topic ahead of a stable one", () => {
    const stable = item({ questionId: "a-stable", topic: "Geometri" });
    const recov = recovering({ questionId: "z-recovering", topic: "Denklemler" });
    expect(build([stable, recov])[0]!.topic).toBe("Denklemler");
  });

  it("does NOT let age outrank learning evidence", () => {
    // The stable topic is far more overdue, but a recovering grip is the more
    // fragile one — elapsed time is context, not urgency.
    const veryOverdueStable = item({
      questionId: "a-stable",
      topic: "Geometri",
      nextReviewAt: NOW - 60 * DAY,
    });
    const barelyDueRecovering = recovering({
      questionId: "z-recovering",
      topic: "Denklemler",
      nextReviewAt: NOW - 60_000,
    });
    expect(build([veryOverdueStable, barelyDueRecovering])[0]!.topic).toBe("Denklemler");
  });

  it("uses overdue-ness only to break ties inside one state", () => {
    const older = item({ questionId: "a", topic: "Geometri", nextReviewAt: NOW - 10 * DAY });
    const newer = item({ questionId: "b", topic: "Denklemler", nextReviewAt: NOW - DAY });
    expect(build([newer, older])[0]!.topic).toBe("Geometri");
  });

  it("is deterministic regardless of input order", () => {
    const a = item({ questionId: "a", topic: "Geometri" });
    const b = item({ questionId: "b", topic: "Denklemler" });
    expect(build([a, b]).map((t) => t.id)).toEqual(build([b, a]).map((t) => t.id));
  });
});

describe("review readiness — shape", () => {
  it("shows one row per topic, not one per question", () => {
    const topics = build([
      item({ questionId: "q1", topic: "Denklemler" }),
      item({ questionId: "q2", topic: "Denklemler" }),
      item({ questionId: "q3", topic: "Denklemler" }),
    ]);
    expect(topics).toHaveLength(1);
    expect(topics[0]!.topic).toBe("Denklemler");
  });

  it("caps the section rather than listing everything due", () => {
    const many = Array.from({ length: MAX_REVIEW_TOPICS + 3 }, (_, i) =>
      item({ questionId: `q${i}`, topic: `Konu ${i}` }),
    );
    expect(build(many)).toHaveLength(MAX_REVIEW_TOPICS);
  });

  it("carries a representative question to route to", () => {
    const topics = build([item({ questionId: "target", topic: "Denklemler" })]);
    expect(topics[0]!.questionId).toBe("target");
  });

  it("records whether chronology backed the decision", () => {
    const events: LearningEvent[] = [
      { id: "e1", questionId: "q1", outcome: "struggled" as StudyOutcome, occurredAt: NOW - 3 * DAY, subject: "Matematik", topic: "Denklemler" },
      { id: "e2", questionId: "q1", outcome: "solved" as StudyOutcome, occurredAt: NOW - 2 * DAY, subject: "Matematik", topic: "Denklemler" },
    ];
    expect(build([item()], events)[0]!.evidenceBasis).toBe("scheduler_due_with_chronology");
    expect(build([item()])[0]!.evidenceBasis).toBe("scheduler_due");
  });
});

describe("review readiness — copy safety", () => {
  it("is observational, never predictive or pseudo-scientific", () => {
    const topics = build([recovering(), item({ questionId: "q2", topic: "Geometri" })]);
    for (const topic of topics) {
      const text = reviewReadyReasonText(topic).toLocaleLowerCase("tr");
      for (const bad of [
        "unutmak",
        "bellek",
        "hafıza gücü",
        "%",
        "olasılık",
        "tahmin",
        "düştü",
      ]) {
        expect(text).not.toContain(bad);
      }
    }
  });

  it("never leaks implementation terms", () => {
    const topics = build([recovering()]);
    const text = reviewReadyReasonText(topics[0]!);
    for (const leak of [
      "nextReviewAt",
      "lastReviewedAt",
      "studyEvents",
      "scheduler_due",
      "persistent_struggle",
      "recovering",
      "intervalDays",
      "SM-2",
    ]) {
      expect(text).not.toContain(leak);
    }
  });
});

// §95 — the scenario the phase is meant to demonstrate.
describe("review readiness — the product case", () => {
  it("prefers the recovering topic reviewed days ago over one solved today", () => {
    const solvedToday = item({
      questionId: "a-stable-today",
      topic: "Geometri",
      lastReviewedAt: NOW,
      // The scheduler gave it a long interval precisely because it went well.
      nextReviewAt: NOW + 8 * DAY,
    });
    const recoveringDaysAgo = recovering({
      questionId: "z-recovering",
      topic: "Denklemler",
      lastReviewedAt: NOW - 4 * DAY,
      nextReviewAt: NOW - 2 * DAY,
    });
    const topics = build([solvedToday, recoveringDaysAgo]);
    expect(topics).toHaveLength(1);
    expect(topics[0]!.topic).toBe("Denklemler");
    expect(reviewReadyReasonText(topics[0]!)).toContain("pekiştirmek için uygun bir zaman");
  });
});
