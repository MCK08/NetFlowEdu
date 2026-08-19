import { buildLearningMoment } from "../../src/features/study/services/learningMoment";
import { TopicInsight } from "../../src/features/study/services/learningInsights";

// Phase 40 audit — buildLearningMoment is a pure, deterministic function
// already wired live into the Learning Hub (useLearningInsights.ts's
// `moment`, rendered by StudyScreen.tsx) but had no unit test of its own.
// This closes that one confirmed gap; buildLearningMoment itself is
// unchanged.

function topic(overrides: Partial<TopicInsight> = {}): TopicInsight {
  return {
    subject: "Matematik",
    topic: "Kesirler",
    struggledCount: 3,
    masteredCount: 0,
    dueCount: 0,
    totalCount: 5,
    sampleQuestionId: "q1",
    masteryBand: "developing",
    recency: "recently_practiced",
    ...overrides,
  };
}

describe("buildLearningMoment", () => {
  it("asks for more data when the trend is insufficient, regardless of weak topics", () => {
    expect(buildLearningMoment("insufficient_data", [topic()])).toBe(
      "Henüz yeterli veri yok. Birkaç soru daha çöz.",
    );
    expect(buildLearningMoment("insufficient_data", [])).toBe(
      "Henüz yeterli veri yok. Birkaç soru daha çöz.",
    );
  });

  it("names the real top weak topic when declining", () => {
    expect(buildLearningMoment("declining", [topic({ subject: "Fizik", topic: "Optik" })])).toBe(
      "Son çalışmalarında Fizik / Optik konusunda daha fazla zorlandın.",
    );
  });

  it("falls back to a topic-free sentence when declining with no weak topics", () => {
    expect(buildLearningMoment("declining", [])).toBe("Son çalışmalarında biraz daha fazla zorlandın.");
  });

  it("never names a weak topic when improving — improving is not "
    + "the moment to point at a struggle", () => {
    expect(buildLearningMoment("improving", [topic()])).toBe("Son tekrarlarında düzenli ilerliyorsun.");
    expect(buildLearningMoment("improving", [])).toBe("Son tekrarlarında düzenli ilerliyorsun.");
  });

  it("names the top weak topic when stable and one exists", () => {
    expect(buildLearningMoment("stable", [topic({ subject: "Kimya", topic: "Asitler" })])).toBe(
      "Kimya / Asitler konusu hâlâ dikkat istiyor.",
    );
  });

  it("falls back to a plain steady-state sentence when stable with no weak topics", () => {
    expect(buildLearningMoment("stable", [])).toBe("Son tekrarlarında istikrarlısın.");
  });

  it("always uses the FIRST weak topic (already ranked worst-first upstream), never re-ranks", () => {
    const topics = [
      topic({ subject: "Fizik", topic: "Optik", struggledCount: 5 }),
      topic({ subject: "Matematik", topic: "Kesirler", struggledCount: 1 }),
    ];
    expect(buildLearningMoment("declining", topics)).toContain("Fizik / Optik");
  });

  it("is deterministic — same input always produces the same sentence", () => {
    const topics = [topic()];
    expect(buildLearningMoment("stable", topics)).toBe(buildLearningMoment("stable", topics));
  });

  it("never returns an empty string for any real trend value", () => {
    const trends = ["insufficient_data", "declining", "improving", "stable"] as const;
    for (const trend of trends) {
      expect(buildLearningMoment(trend, [])).not.toBe("");
      expect(buildLearningMoment(trend, [topic()])).not.toBe("");
    }
  });

  it("never invents a score, percentage, or AI claim — same explainability bar as nextActionCopy", () => {
    const trends = ["insufficient_data", "declining", "improving", "stable"] as const;
    for (const trend of trends) {
      const sentence = buildLearningMoment(trend, [topic()]);
      expect(sentence).not.toMatch(/%/);
      expect(sentence.toLowerCase()).not.toContain("ai");
      expect(sentence.toLowerCase()).not.toContain("skor");
    }
  });

  it("does not mutate the weakTopics array it is given", () => {
    const topics = [topic()];
    const copy = [...topics];
    buildLearningMoment("declining", topics);
    expect(topics).toEqual(copy);
  });
});
