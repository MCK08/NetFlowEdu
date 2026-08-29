import { StudentAssignmentCard } from "../../src/features/assignments/hooks/useStudentAssignments";
import { buildStudentDailyFlow } from "../../src/features/dailyFlow/services/buildStudentDailyFlow";
import { MAX_DAILY_FLOW_ITEMS } from "../../src/features/dailyFlow/services/dailyFlowTypes";
import { TopicInsight } from "../../src/features/study/services/learningInsights";

function topic(overrides: Partial<TopicInsight> = {}): TopicInsight {
  return {
    subject: "Matematik",
    topic: "Denklemler",
    struggledCount: 1,
    struggledAttemptCount: 8,
    masteredCount: 0,
    dueCount: 0,
    totalCount: 3,
    sampleQuestionId: "q-sample",
    masteryBand: "shaky",
    recency: "stale",
    lastReviewedAt: 0,
    ...(overrides as Partial<TopicInsight>),
  } as TopicInsight;
}

function assignmentCard(
  status: StudentAssignmentCard["status"],
  overrides: { id?: string; title?: string } = {},
): StudentAssignmentCard {
  return {
    assignment: {
      id: overrides.id ?? "a-1",
      title: overrides.title ?? "Denklemler Ödevi",
      subject: "Matematik",
      topic: "Denklemler",
      createdAt: 0,
    },
    submission: null,
    status,
  } as unknown as StudentAssignmentCard;
}

const BASE = {
  assignmentCards: [] as StudentAssignmentCard[],
  weakTopics: [] as TopicInsight[],
  dueCount: 0,
  hasStudyHistory: true,
};

describe("buildStudentDailyFlow — priority ladder", () => {
  it("puts an open assignment first", () => {
    const items = buildStudentDailyFlow({
      ...BASE,
      assignmentCards: [assignmentCard("not_started")],
      dueCount: 4,
      weakTopics: [topic()],
    });
    expect(items[0]?.kind).toBe("assignment");
    expect(items[0]?.target).toEqual({ kind: "assignment", assignmentId: "a-1" });
  });

  it("puts due review above topic reinforcement", () => {
    const items = buildStudentDailyFlow({ ...BASE, dueCount: 3, weakTopics: [topic()] });
    expect(items.map((item) => item.kind)).toEqual(["due_review", "reinforce_topic"]);
  });

  it("uses the real due count, never a rounded or invented one", () => {
    const items = buildStudentDailyFlow({ ...BASE, dueCount: 7 });
    expect(items[0]?.reason).toBe("7 soru tekrar edilmeyi bekliyor.");
  });
});

describe("buildStudentDailyFlow — assignments", () => {
  it("offers 'Devam Et' for a started assignment and 'Ödeve Başla' otherwise", () => {
    expect(
      buildStudentDailyFlow({ ...BASE, assignmentCards: [assignmentCard("in_progress")] })[0]
        ?.actionLabel,
    ).toBe("Devam Et");
    expect(
      buildStudentDailyFlow({ ...BASE, assignmentCards: [assignmentCard("not_started")] })[0]
        ?.actionLabel,
    ).toBe("Ödeve Başla");
  });

  it("ignores completed assignments", () => {
    const items = buildStudentDailyFlow({
      ...BASE,
      assignmentCards: [assignmentCard("completed")],
    });
    expect(items.some((item) => item.kind === "assignment")).toBe(false);
  });

  // §50 — a past-due assignment cannot be acted on to change its outcome, so
  // surfacing it here would be manufactured urgency, not a next action.
  it("ignores past-due assignments rather than surfacing them as urgent", () => {
    const items = buildStudentDailyFlow({
      ...BASE,
      assignmentCards: [assignmentCard("past_due")],
    });
    expect(items.some((item) => item.kind === "assignment")).toBe(false);
  });

  it("shows only ONE assignment row even when several are open", () => {
    const items = buildStudentDailyFlow({
      ...BASE,
      assignmentCards: [
        assignmentCard("not_started", { id: "a-1" }),
        assignmentCard("in_progress", { id: "a-2" }),
        assignmentCard("not_started", { id: "a-3" }),
      ],
    });
    expect(items.filter((item) => item.kind === "assignment")).toHaveLength(1);
  });

  it("never invents due-date urgency wording", () => {
    const items = buildStudentDailyFlow({
      ...BASE,
      assignmentCards: [assignmentCard("not_started")],
    });
    const text = `${items[0]?.title} ${items[0]?.reason ?? ""} ${items[0]?.actionLabel}`;
    expect(text).not.toMatch(/bugün|yarın|son gün|gecikti|acil|kaldı/i);
  });
});

describe("buildStudentDailyFlow — evidence honesty", () => {
  // Phase 41's completeness rule: null is unknown, never zero.
  it("does NOT produce a reinforcement row when struggle evidence is untrustworthy (legacy)", () => {
    const items = buildStudentDailyFlow({
      ...BASE,
      weakTopics: [topic({ struggledAttemptCount: null })],
    });
    expect(items.some((item) => item.kind === "reinforce_topic")).toBe(false);
  });

  it("does NOT produce a reinforcement row when the real struggle count is zero", () => {
    const items = buildStudentDailyFlow({
      ...BASE,
      weakTopics: [topic({ struggledAttemptCount: 0 })],
    });
    expect(items.some((item) => item.kind === "reinforce_topic")).toBe(false);
  });

  it("produces a reinforcement row on real evidence, routed to a real question", () => {
    const items = buildStudentDailyFlow({
      ...BASE,
      weakTopics: [topic({ struggledAttemptCount: 8, sampleQuestionId: "q-heavy" })],
    });
    const row = items.find((item) => item.kind === "reinforce_topic");
    expect(row?.target).toEqual({ kind: "question", questionId: "q-heavy" });
    expect(row?.isAttention).toBe(true);
  });

  it("never exposes classifier jargon or raw counts in copy", () => {
    const items = buildStudentDailyFlow({
      ...BASE,
      dueCount: 2,
      assignmentCards: [assignmentCard("in_progress")],
      weakTopics: [topic({ struggledAttemptCount: 8 })],
    });
    for (const item of items) {
      const text = `${item.title} ${item.reason ?? ""} ${item.actionLabel}`;
      expect(text).not.toMatch(
        /persistent_struggle|one_off_struggle|recovering|insufficient_data|struggledCount|masteryBand/,
      );
    }
  });

  it("never fabricates a time estimate", () => {
    const items = buildStudentDailyFlow({
      ...BASE,
      dueCount: 2,
      assignmentCards: [assignmentCard("not_started")],
      weakTopics: [topic()],
    });
    for (const item of items) {
      const text = `${item.title} ${item.reason ?? ""} ${item.actionLabel}`;
      expect(text).not.toMatch(/\d+\s*(dk|dakika|saniye|saat|min)/i);
    }
  });
});

describe("buildStudentDailyFlow — deduplication", () => {
  // §47 — the exact duplicate pair the spec names: a reinforcement row and a
  // generic practice row driven by the same weak-topic evidence.
  it("suppresses the generic practice row when a reinforcement row exists", () => {
    const items = buildStudentDailyFlow({
      ...BASE,
      weakTopics: [topic({ struggledAttemptCount: 8 })],
    });
    expect(items.some((item) => item.kind === "reinforce_topic")).toBe(true);
    expect(items.some((item) => item.kind === "practice")).toBe(false);
  });

  it("falls back to the practice row when the topic has no trustworthy evidence", () => {
    const items = buildStudentDailyFlow({
      ...BASE,
      weakTopics: [topic({ struggledAttemptCount: null })],
    });
    expect(items.map((item) => item.kind)).toEqual(["practice"]);
  });
});

describe("buildStudentDailyFlow — bounds, emptiness and stability", () => {
  it("never returns more than the maximum", () => {
    const items = buildStudentDailyFlow({
      ...BASE,
      assignmentCards: [assignmentCard("not_started")],
      dueCount: 5,
      weakTopics: [topic({ struggledAttemptCount: 8 })],
    });
    expect(items.length).toBeLessThanOrEqual(MAX_DAILY_FLOW_ITEMS);
  });

  it("returns nothing at all when there is nothing to do", () => {
    expect(buildStudentDailyFlow(BASE)).toEqual([]);
  });

  // First-run: no history means the adaptive session would be empty, so the
  // caller shows first-run guidance instead of a row that goes nowhere useful.
  it("returns nothing for a brand-new student with no history", () => {
    expect(
      buildStudentDailyFlow({ ...BASE, hasStudyHistory: false, weakTopics: [topic()] }),
    ).toEqual([]);
  });

  it("is deterministic and stable across repeated calls", () => {
    const params = {
      ...BASE,
      assignmentCards: [assignmentCard("not_started")],
      dueCount: 2,
      weakTopics: [topic({ struggledAttemptCount: 8 })],
    };
    expect(buildStudentDailyFlow(params)).toEqual(buildStudentDailyFlow(params));
  });

  it("gives every item a stable, unique id", () => {
    const items = buildStudentDailyFlow({
      ...BASE,
      assignmentCards: [assignmentCard("not_started")],
      dueCount: 2,
      weakTopics: [topic({ struggledAttemptCount: 8 })],
    });
    const ids = items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("does not mutate its inputs", () => {
    const cards = [assignmentCard("not_started")];
    const topics = [topic()];
    const cardsCopy = [...cards];
    const topicsCopy = [...topics];
    buildStudentDailyFlow({ ...BASE, assignmentCards: cards, weakTopics: topics });
    expect(cards).toEqual(cardsCopy);
    expect(topics).toEqual(topicsCopy);
  });
});
