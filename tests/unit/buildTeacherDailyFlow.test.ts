import { buildTeacherDailyFlow } from "../../src/features/dailyFlow/services/buildTeacherDailyFlow";
import { MAX_DAILY_FLOW_ITEMS } from "../../src/features/dailyFlow/services/dailyFlowTypes";
import { ClassTopicHotspot } from "../../src/features/teacher/services/classTopicInsights";
import {
  AttentionCategory,
  StudentAttentionCard,
} from "../../src/features/teacher/services/studentAttention";

function card(
  studentUid: string,
  category: AttentionCategory,
  reason = "Son çalışmalarında çoğunlukla zorlandı",
): StudentAttentionCard {
  return {
    studentUid,
    displayName: `Öğrenci ${studentUid.toUpperCase()}`,
    insight: { category, reasons: [reason], implicatedTopic: null },
    successRatePercent: 40,
  } as StudentAttentionCard;
}

function hotspot(overrides: Partial<ClassTopicHotspot> = {}): ClassTopicHotspot {
  return {
    subject: "Matematik",
    topic: "Denklemler",
    studentsWithAttempts: 6,
    strugglingStudents: 4,
    struggledAttemptCount: 28,
    gradeLevel: "10",
    ...(overrides as Partial<ClassTopicHotspot>),
  } as ClassTopicHotspot;
}

const BASE = {
  attentionCards: [] as StudentAttentionCard[],
  topicHotspots: [] as ClassTopicHotspot[],
  classId: "class-1" as string | null,
};

describe("buildTeacherDailyFlow — actionable signals only", () => {
  it("surfaces students needing attention", () => {
    const items = buildTeacherDailyFlow({
      ...BASE,
      attentionCards: [card("a", "needs_attention")],
    });
    expect(items[0]?.kind).toBe("student_signal");
    expect(items[0]?.target).toEqual({
      kind: "student_performance",
      classId: "class-1",
      studentUid: "a",
    });
    expect(items[0]?.isAttention).toBe(true);
  });

  it("surfaces watch-category students, but not as attention", () => {
    const items = buildTeacherDailyFlow({ ...BASE, attentionCards: [card("a", "watch")] });
    expect(items).toHaveLength(1);
    expect(items[0]?.isAttention).toBe(false);
  });

  it.each(["progressing", "strong", "insufficient_data"] as const)(
    "never surfaces a %s student as a signal to act on",
    (category) => {
      const items = buildTeacherDailyFlow({ ...BASE, attentionCards: [card("a", category)] });
      expect(items.some((item) => item.kind === "student_signal")).toBe(false);
    },
  );

  // §24 — insufficient evidence must not be promoted into an urgent action.
  it("does not turn insufficient_data into an intervention prompt", () => {
    const items = buildTeacherDailyFlow({
      ...BASE,
      attentionCards: [card("d", "insufficient_data", "Bu sınıfta henüz çalışmadı")],
    });
    expect(items).toEqual([]);
  });
});

describe("buildTeacherDailyFlow — ordering and bounds", () => {
  it("preserves the incoming attention ordering rather than re-sorting", () => {
    const items = buildTeacherDailyFlow({
      ...BASE,
      attentionCards: [card("f", "needs_attention"), card("e", "needs_attention")],
    });
    expect(items.map((item) => item.title)).toEqual(["Öğrenci F", "Öğrenci E"]);
  });

  it("caps per-student rows so a hotspot can still appear", () => {
    const items = buildTeacherDailyFlow({
      ...BASE,
      attentionCards: [
        card("a", "needs_attention"),
        card("b", "needs_attention"),
        card("c", "needs_attention"),
      ],
      topicHotspots: [hotspot()],
    });
    expect(items.filter((item) => item.kind === "student_signal")).toHaveLength(2);
    expect(items.filter((item) => item.kind === "topic_hotspot")).toHaveLength(1);
  });

  it("never returns more than the maximum", () => {
    const items = buildTeacherDailyFlow({
      ...BASE,
      attentionCards: [card("a", "needs_attention"), card("b", "needs_attention")],
      topicHotspots: [hotspot(), hotspot({ topic: "Kesirler" })],
    });
    expect(items.length).toBeLessThanOrEqual(MAX_DAILY_FLOW_ITEMS);
  });

  it("is deterministic across repeated calls", () => {
    const params = {
      ...BASE,
      attentionCards: [card("a", "needs_attention")],
      topicHotspots: [hotspot()],
    };
    expect(buildTeacherDailyFlow(params)).toEqual(buildTeacherDailyFlow(params));
  });
});

describe("buildTeacherDailyFlow — hotspot routing", () => {
  it("routes a hotspot into the existing composer with its real metadata", () => {
    const items = buildTeacherDailyFlow({ ...BASE, topicHotspots: [hotspot()] });
    expect(items[0]?.target).toEqual({
      kind: "assignment_composer",
      classId: "class-1",
      subject: "Matematik",
      topic: "Denklemler",
      gradeLevel: "10",
    });
  });

  // Phase 43's rule: an unresolvable grade stays null and is omitted by the
  // caller — never defaulted to a guess.
  it("carries a null gradeLevel through rather than inventing one", () => {
    const items = buildTeacherDailyFlow({
      ...BASE,
      topicHotspots: [hotspot({ gradeLevel: null })],
    });
    expect(items[0]?.target).toMatchObject({ gradeLevel: null });
  });
});

describe("buildTeacherDailyFlow — deduplication and emptiness", () => {
  // §48 — one row per student carrying that student's one reason, never a
  // separate "struggling" row and "needs intervention" row for one concern.
  it("emits exactly one row per student", () => {
    const items = buildTeacherDailyFlow({
      ...BASE,
      attentionCards: [card("a", "needs_attention")],
    });
    expect(items.filter((item) => item.id === "student:a")).toHaveLength(1);
  });

  it("returns nothing when there is no class to route to", () => {
    expect(
      buildTeacherDailyFlow({
        ...BASE,
        classId: null,
        attentionCards: [card("a", "needs_attention")],
        topicHotspots: [hotspot()],
      }),
    ).toEqual([]);
  });

  it("returns nothing when no signal is actionable", () => {
    expect(buildTeacherDailyFlow(BASE)).toEqual([]);
  });

  it("never claims causality in its copy", () => {
    const items = buildTeacherDailyFlow({
      ...BASE,
      attentionCards: [card("a", "needs_attention")],
      topicHotspots: [hotspot()],
    });
    for (const item of items) {
      const text = `${item.title} ${item.reason ?? ""} ${item.actionLabel}`;
      expect(text).not.toMatch(/sayesinde|neden oldu|iyileştirdi|kötüleştirdi|başarısız oldu/i);
    }
  });

  it("does not mutate its inputs", () => {
    const cards = [card("a", "needs_attention")];
    const hotspots = [hotspot()];
    const cardsCopy = [...cards];
    const hotspotsCopy = [...hotspots];
    buildTeacherDailyFlow({ ...BASE, attentionCards: cards, topicHotspots: hotspots });
    expect(cards).toEqual(cardsCopy);
    expect(hotspots).toEqual(hotspotsCopy);
  });
});
