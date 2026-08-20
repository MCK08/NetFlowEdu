import {
  buildTeacherActionSummary,
  MAX_TEACHER_ACTIONS,
} from "../../src/features/teacher/services/teacherActionSummary";
import { ClassTopicHotspot } from "../../src/features/teacher/services/classTopicInsights";
import { StudentAttentionCard } from "../../src/features/teacher/services/studentAttention";

function hotspot(overrides: Partial<ClassTopicHotspot> = {}): ClassTopicHotspot {
  return {
    subject: "Matematik",
    topic: "Denklemler",
    studentsWithAttempts: 5,
    strugglingStudents: 3,
    // Phase 42 — buildTeacherActionSummary reads strugglingStudents only,
    // never the event count; null keeps this fixture describing a class
    // with no cumulative history rather than implying zero struggles.
    struggledAttemptCount: null,
    masteredStudents: 0,
    dueStudents: 0,
    sampleQuestionId: "q1",
    ...overrides,
  };
}

function attentionCard(overrides: Partial<StudentAttentionCard> = {}): StudentAttentionCard {
  return {
    studentUid: "u1",
    displayName: "Ahmet",
    successRatePercent: null,
    insight: { category: "needs_attention", reasons: ["Son çalışmalarında çoğunlukla zorlandı"], implicatedTopic: null },
    ...overrides,
  };
}

describe("buildTeacherActionSummary — no action", () => {
  it("returns an empty list with no hotspots and no priority students", () => {
    expect(buildTeacherActionSummary([], [])).toEqual([]);
  });

  it("returns an empty list when only progressing/strong/insufficient_data students exist", () => {
    const cards = [
      attentionCard({ studentUid: "a", insight: { category: "strong", reasons: [], implicatedTopic: null } }),
      attentionCard({ studentUid: "b", insight: { category: "progressing", reasons: [], implicatedTopic: null } }),
      attentionCard({
        studentUid: "c",
        insight: { category: "insufficient_data", reasons: [], implicatedTopic: null },
      }),
    ];
    expect(buildTeacherActionSummary([], cards)).toEqual([]);
  });
});

describe("buildTeacherActionSummary — one hotspot", () => {
  it("produces exactly one create_question action for a single hotspot", () => {
    const actions = buildTeacherActionSummary([hotspot()], []);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      kind: "create_question",
      topicContext: { subject: "Matematik", topic: "Denklemler" },
    });
    expect(actions[0]?.reason).toContain("3");
  });
});

describe("buildTeacherActionSummary — multiple hotspots, priority", () => {
  it("keeps hotspots in the order they were given (already-sorted, most-struggling first)", () => {
    const hotspots = [
      hotspot({ subject: "Matematik", topic: "Denklemler", strugglingStudents: 7 }),
      hotspot({ subject: "Fizik", topic: "Kuvvet", strugglingStudents: 5 }),
    ];
    const actions = buildTeacherActionSummary(hotspots, []);
    expect(actions.map((a) => a.title)).toEqual(["Matematik · Denklemler", "Fizik · Kuvvet"]);
  });

  it("places needs_attention/watch students after all hotspots", () => {
    const hotspots = [hotspot()];
    const cards = [
      attentionCard({ studentUid: "s1", insight: { category: "needs_attention", reasons: ["r"], implicatedTopic: null } }),
    ];
    const actions = buildTeacherActionSummary(hotspots, cards);
    expect(actions[0]?.kind).toBe("create_question");
    expect(actions[1]?.kind).toBe("open_student");
  });

  it("excludes progressing/strong/insufficient_data students from the summary", () => {
    const cards = [
      attentionCard({ studentUid: "a", insight: { category: "needs_attention", reasons: ["r"], implicatedTopic: null } }),
      attentionCard({ studentUid: "b", insight: { category: "strong", reasons: [], implicatedTopic: null } }),
      attentionCard({ studentUid: "c", insight: { category: "watch", reasons: ["w"], implicatedTopic: null } }),
      attentionCard({
        studentUid: "d",
        insight: { category: "insufficient_data", reasons: [], implicatedTopic: null },
      }),
    ];
    const actions = buildTeacherActionSummary([], cards);
    expect(actions.map((a) => a.studentUid)).toEqual(["a", "c"]);
  });
});

describe("buildTeacherActionSummary — cap and ordering", () => {
  it("caps the total at MAX_TEACHER_ACTIONS even with many hotspots and students", () => {
    const hotspots = Array.from({ length: 6 }, (_, i) =>
      hotspot({ subject: "Matematik", topic: `Konu${i}`, strugglingStudents: 6 - i }),
    );
    const cards = Array.from({ length: 6 }, (_, i) =>
      attentionCard({
        studentUid: `s${i}`,
        insight: { category: "needs_attention", reasons: ["r"], implicatedTopic: null },
      }),
    );
    const actions = buildTeacherActionSummary(hotspots, cards);
    expect(actions).toHaveLength(MAX_TEACHER_ACTIONS);
  });

  it("never produces a duplicate topic even if the hotspot list somehow repeats one", () => {
    const hotspots = [
      hotspot({ subject: "Matematik", topic: "Denklemler", strugglingStudents: 5 }),
      hotspot({ subject: "Matematik", topic: "Denklemler", strugglingStudents: 3 }),
    ];
    const actions = buildTeacherActionSummary(hotspots, []);
    expect(actions).toHaveLength(1);
  });

  it("preserves a same-score tie in the input order (deterministic, no re-sort)", () => {
    const cards = [
      attentionCard({ studentUid: "b", displayName: "B", successRatePercent: 40, insight: { category: "needs_attention", reasons: [], implicatedTopic: null } }),
      attentionCard({ studentUid: "a", displayName: "A", successRatePercent: 40, insight: { category: "needs_attention", reasons: [], implicatedTopic: null } }),
    ];
    const actions = buildTeacherActionSummary([], cards);
    // Input order preserved exactly — the caller (attentionCards) already
    // owns tie-breaking, this function must not silently re-sort.
    expect(actions.map((a) => a.studentUid)).toEqual(["b", "a"]);
  });
});

describe("buildTeacherActionSummary — robustness", () => {
  it("does not mutate the input arrays", () => {
    const hotspots = [hotspot()];
    const cards = [attentionCard()];
    const hotspotsCopy = JSON.parse(JSON.stringify(hotspots));
    const cardsCopy = JSON.parse(JSON.stringify(cards));
    buildTeacherActionSummary(hotspots, cards);
    expect(hotspots).toEqual(hotspotsCopy);
    expect(cards).toEqual(cardsCopy);
  });

  it("is deterministic for the same input", () => {
    const hotspots = [hotspot()];
    const cards = [attentionCard()];
    const a = buildTeacherActionSummary(hotspots, cards);
    const b = buildTeacherActionSummary(hotspots, cards);
    expect(a).toEqual(b);
  });
});
