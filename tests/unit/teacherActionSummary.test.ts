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
    // Phase 43 — no question metadata behind this fixture, so the topic's
    // grade is genuinely unresolvable. null, never a default.
    gradeLevel: null,
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

// Phase 43 — the action list gained grade context, and nothing else. The
// ordering contract is unchanged on purpose: reordering what every teacher
// sees first, mid-phase, with no evidence it serves them better, is the
// silent re-ranking this phase set out to avoid.
describe("buildTeacherActionSummary — Phase 43 grade context", () => {
  it("carries the hotspot's own gradeLevel into the action", () => {
    const actions = buildTeacherActionSummary([hotspot({ gradeLevel: "12" })], []);
    expect(actions[0]?.topicContext).toEqual({
      subject: "Matematik",
      topic: "Denklemler",
      gradeLevel: "12",
    });
  });

  it("carries a null gradeLevel through rather than substituting one", () => {
    const actions = buildTeacherActionSummary([hotspot({ gradeLevel: null })], []);
    expect(actions[0]?.topicContext?.gradeLevel).toBeNull();
  });

  // A student's implicated topic comes from the weak-topic ranking, which is
  // not grade-scoped — it must not borrow an unrelated hotspot's grade.
  it("never invents a grade for a student's implicated topic", () => {
    const actions = buildTeacherActionSummary(
      [],
      [
        attentionCard({
          insight: {
            category: "needs_attention",
            reasons: ["Aynı soruda 8 kez zorlandı"],
            implicatedTopic: { subject: "Matematik", topic: "Denklemler" },
          },
        }),
      ],
    );
    expect(actions[0]?.kind).toBe("open_student");
    expect(actions[0]?.topicContext?.gradeLevel).toBeNull();
  });

  it("produces the SAME action ordering as before the grade was added", () => {
    const hotspots = [
      hotspot({ topic: "A", strugglingStudents: 3, gradeLevel: "9" }),
      hotspot({ topic: "B", strugglingStudents: 1, gradeLevel: null }),
    ];
    const cards = [
      attentionCard({
        studentUid: "u1",
        displayName: "Ahmet",
        insight: { category: "needs_attention", reasons: ["x"], implicatedTopic: null },
      }),
    ];
    const actions = buildTeacherActionSummary(hotspots, cards);
    expect(actions.map((a) => a.kind)).toEqual(["create_question", "create_question", "open_student"]);
    expect(actions.map((a) => a.title)).toEqual([
      "Matematik · A",
      "Matematik · B",
      "Ahmet",
    ]);
  });

  it("adds no new action kind", () => {
    const actions = buildTeacherActionSummary(
      [hotspot()],
      [
        attentionCard({
          insight: { category: "needs_attention", reasons: ["x"], implicatedTopic: null },
        }),
      ],
    );
    for (const action of actions) {
      expect(["create_question", "open_student"]).toContain(action.kind);
    }
  });
});
