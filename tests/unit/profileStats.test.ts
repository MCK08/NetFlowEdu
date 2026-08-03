import {
  formatCount,
  formatStatValue,
  ownProfileStats,
  publicProfileStats,
  statValue,
  UNAVAILABLE_STAT_TEXT,
} from "@features/profile/services/profileStats";

describe("formatCount", () => {
  it("prints small counts verbatim, including a real zero", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(7)).toBe("7");
    expect(formatCount(999)).toBe("999");
  });

  it("abbreviates thousands and millions so a stat row cannot overflow", () => {
    expect(formatCount(1_000)).toBe("1.0B");
    expect(formatCount(1_500_000)).toBe("1.5M");
  });

  it("refuses to render a negative or non-finite value as a number", () => {
    expect(formatCount(-1)).toBe(UNAVAILABLE_STAT_TEXT);
    expect(formatCount(Number.NaN)).toBe(UNAVAILABLE_STAT_TEXT);
    expect(formatCount(Number.POSITIVE_INFINITY)).toBe(UNAVAILABLE_STAT_TEXT);
  });
});

describe("formatStatValue — loading is never rendered as zero", () => {
  it("renders a real zero as '0'", () => {
    expect(formatStatValue({ kind: "value", value: 0 })).toBe("0");
  });

  it("renders a loading stat as the placeholder, NOT as 0", () => {
    expect(formatStatValue({ kind: "loading" })).toBe(UNAVAILABLE_STAT_TEXT);
    expect(formatStatValue({ kind: "loading" })).not.toBe("0");
  });

  it("renders an unavailable stat as the placeholder, NOT as 0", () => {
    expect(formatStatValue({ kind: "unavailable" })).toBe(UNAVAILABLE_STAT_TEXT);
    expect(formatStatValue({ kind: "unavailable" })).not.toBe("0");
  });
});

describe("statValue", () => {
  it("treats a real number, including zero, as a value", () => {
    expect(statValue(0)).toEqual({ kind: "value", value: 0 });
    expect(statValue(42)).toEqual({ kind: "value", value: 42 });
  });

  it("treats null and undefined as unavailable rather than zero", () => {
    expect(statValue(null)).toEqual({ kind: "unavailable" });
    expect(statValue(undefined)).toEqual({ kind: "unavailable" });
  });
});

describe("ownProfileStats", () => {
  const base = {
    friendCount: 3,
    incomingRequestCount: 2,
    totalPoints: 120,
    isSocialMetaLoading: false,
  };

  it("exposes friends, incoming requests and points", () => {
    expect(ownProfileStats(base).map((s) => s.key)).toEqual(["friends", "requests", "points"]);
  });

  it("reports real values once socialMeta has loaded", () => {
    const stats = ownProfileStats(base);
    expect(stats[0]?.state).toEqual({ kind: "value", value: 3 });
    expect(stats[1]?.state).toEqual({ kind: "value", value: 2 });
  });

  it("marks the socialMeta-backed stats as loading, never as zero, before they arrive", () => {
    const stats = ownProfileStats({ ...base, friendCount: 0, incomingRequestCount: 0, isSocialMetaLoading: true });
    expect(stats[0]?.state).toEqual({ kind: "loading" });
    expect(stats[1]?.state).toEqual({ kind: "loading" });
    expect(formatStatValue(stats[0]!.state)).not.toBe("0");
  });

  it("still reports a genuine zero friend count as a value once loaded", () => {
    const stats = ownProfileStats({ ...base, friendCount: 0 });
    expect(stats[0]?.state).toEqual({ kind: "value", value: 0 });
    expect(formatStatValue(stats[0]!.state)).toBe("0");
  });

  it("marks points unavailable when the profile has no points field", () => {
    const stats = ownProfileStats({ ...base, totalPoints: undefined });
    expect(stats[2]?.state).toEqual({ kind: "unavailable" });
  });

  it("gives every stat a non-empty Turkish label", () => {
    for (const stat of ownProfileStats(base)) {
      expect(stat.label.length).toBeGreaterThan(0);
    }
  });
});

describe("publicProfileStats", () => {
  const base = { totalPoints: 90, weeklyPoints: 12, isLoading: false };

  it("exposes only statistics that are genuinely complete", () => {
    expect(publicProfileStats(base).map((s) => s.key)).toEqual(["totalPoints", "weeklyPoints"]);
  });

  // The concrete defect this replaces: the screen used to show
  // `questions.length` under a "Soru" label while getUserPublicQuestions
  // caps at limit(30), so a prolific user's total was silently wrong.
  it("never claims to know a total question count", () => {
    const keys = publicProfileStats(base).map((s) => s.key);
    expect(keys).not.toContain("questions");
    expect(publicProfileStats(base).map((s) => s.label)).not.toContain("Soru");
  });

  it("marks points as loading rather than zero while the profile loads", () => {
    const stats = publicProfileStats({ totalPoints: 0, weeklyPoints: 0, isLoading: true });
    expect(stats[0]?.state).toEqual({ kind: "loading" });
    expect(formatStatValue(stats[0]!.state)).not.toBe("0");
  });

  it("reports a genuine zero score as a value once loaded", () => {
    const stats = publicProfileStats({ totalPoints: 0, weeklyPoints: 0, isLoading: false });
    expect(stats[0]?.state).toEqual({ kind: "value", value: 0 });
  });

  it("marks a missing score unavailable", () => {
    const stats = publicProfileStats({ totalPoints: null, weeklyPoints: null, isLoading: false });
    expect(stats[0]?.state).toEqual({ kind: "unavailable" });
    expect(stats[1]?.state).toEqual({ kind: "unavailable" });
  });
});
