import {
  buildTopicMastery,
  masteryBandPriorityIndex,
  MASTERY_BAND_PRIORITY,
  TopicMasteryInput,
} from "../../src/features/study/services/topicMastery";

function input(overrides: Partial<TopicMasteryInput> = {}): TopicMasteryInput {
  return {
    totalCount: 0,
    masteredCount: 0,
    struggledCount: 0,
    everSucceededCount: 0,
    ...overrides,
  };
}

describe("buildTopicMastery", () => {
  it("is 'new' for a topic with no items at all", () => {
    expect(buildTopicMastery(input({ totalCount: 0 }))).toBe("new");
  });

  it("is 'mastered' only when every item in the topic is server-mastered", () => {
    expect(
      buildTopicMastery(input({ totalCount: 3, masteredCount: 3, everSucceededCount: 3 })),
    ).toBe("mastered");
  });

  it("is NOT 'mastered' when only some items are mastered", () => {
    expect(
      buildTopicMastery(
        input({ totalCount: 3, masteredCount: 2, everSucceededCount: 3, struggledCount: 0 }),
      ),
    ).not.toBe("mastered");
  });

  it("is 'shaky' when attempted, struggled at least once, and never once succeeded", () => {
    expect(
      buildTopicMastery(input({ totalCount: 2, struggledCount: 2, everSucceededCount: 0 })),
    ).toBe("shaky");
  });

  it("is 'learning' when attempted but nothing struggled or succeeded yet", () => {
    expect(
      buildTopicMastery(input({ totalCount: 1, struggledCount: 0, everSucceededCount: 0 })),
    ).toBe("learning");
  });

  it("is 'strong' with at least one mastered item and no struggles", () => {
    expect(
      buildTopicMastery(
        input({ totalCount: 3, masteredCount: 1, struggledCount: 0, everSucceededCount: 3 }),
      ),
    ).toBe("strong");
  });

  it("is 'strong' with zero struggles even without a mastered item yet", () => {
    expect(
      buildTopicMastery(
        input({ totalCount: 2, masteredCount: 0, struggledCount: 0, everSucceededCount: 2 }),
      ),
    ).toBe("strong");
  });

  it("is 'developing' for a real mix: some success, some struggle, not fully mastered", () => {
    expect(
      buildTopicMastery(
        input({ totalCount: 3, masteredCount: 0, struggledCount: 1, everSucceededCount: 2 }),
      ),
    ).toBe("developing");
  });

  it("mixed but with at least one fully mastered item -> strong, even alongside a struggle", () => {
    expect(
      buildTopicMastery(
        input({ totalCount: 3, masteredCount: 1, struggledCount: 1, everSucceededCount: 2 }),
      ),
    ).toBe("strong");
  });

  it("insufficient/garbage counts never throw and collapse to safe defaults", () => {
    expect(() =>
      buildTopicMastery({
        totalCount: NaN,
        masteredCount: Infinity,
        struggledCount: -5,
        everSucceededCount: -1,
      }),
    ).not.toThrow();
    expect(
      buildTopicMastery({
        totalCount: NaN,
        masteredCount: Infinity,
        struggledCount: -5,
        everSucceededCount: -1,
      }),
    ).toBe("new");
  });

  it("is deterministic — same input always produces the same output", () => {
    const params = input({ totalCount: 4, masteredCount: 1, struggledCount: 1, everSucceededCount: 3 });
    const first = buildTopicMastery(params);
    const second = buildTopicMastery(params);
    expect(first).toBe(second);
  });

  it("does not mutate its input", () => {
    const params = input({ totalCount: 4, masteredCount: 1, struggledCount: 1, everSucceededCount: 3 });
    const copy = { ...params };
    buildTopicMastery(params);
    expect(params).toEqual(copy);
  });
});

describe("masteryBandPriorityIndex", () => {
  it("orders shaky as the most urgent band", () => {
    expect(masteryBandPriorityIndex("shaky")).toBe(0);
  });

  it("orders mastered as the least urgent band", () => {
    expect(masteryBandPriorityIndex("mastered")).toBe(MASTERY_BAND_PRIORITY.length - 1);
  });

  it("gives every band a distinct index", () => {
    const indexes = MASTERY_BAND_PRIORITY.map((band) => masteryBandPriorityIndex(band));
    expect(new Set(indexes).size).toBe(MASTERY_BAND_PRIORITY.length);
  });
});
