import { readFileSync } from "fs";
import { join } from "path";

import * as profileStatsModule from "@features/profile/services/profileStats";
import {
  formatCount,
  formatStatValue,
  ownProfileStats,
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
    socialMetaStatus: "ready" as const,
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
    const stats = ownProfileStats({ ...base, friendCount: 0, incomingRequestCount: 0, socialMetaStatus: "loading" });
    expect(stats[0]?.state).toEqual({ kind: "loading" });
    expect(stats[1]?.state).toEqual({ kind: "loading" });
    expect(formatStatValue(stats[0]!.state)).not.toBe("0");
  });

  it("still reports a genuine zero friend count as a value once loaded", () => {
    const stats = ownProfileStats({ ...base, friendCount: 0 });
    expect(stats[0]?.state).toEqual({ kind: "value", value: 0 });
    expect(formatStatValue(stats[0]!.state)).toBe("0");
  });

  // Phase 103 — found on the simulator with a freshly seeded student: a user
  // with no friendship activity has no socialMeta document, so the summary
  // stays all-zero with updatedAt 0. Profile read that as "still loading" and
  // showed placeholder pills forever. A missing document is an answer.
  it("shows a user with no friendship activity as 0, not as loading forever", () => {
    const stats = ownProfileStats({ ...base, friendCount: 0, incomingRequestCount: 0, socialMetaStatus: "ready" });
    expect(stats[0]?.state).toEqual({ kind: "value", value: 0 });
    expect(stats[1]?.state).toEqual({ kind: "value", value: 0 });
    expect(formatStatValue(stats[0]!.state)).toBe("0");
  });

  it("shows a failed socialMeta listener as unavailable, never as a confident 0", () => {
    const stats = ownProfileStats({ ...base, friendCount: 0, incomingRequestCount: 0, socialMetaStatus: "error" });
    expect(stats[0]?.state).toEqual({ kind: "unavailable" });
    expect(stats[1]?.state).toEqual({ kind: "unavailable" });
    expect(formatStatValue(stats[0]!.state)).toBe(UNAVAILABLE_STAT_TEXT);
    // Points do not come from socialMeta and are unaffected.
    expect(stats[2]?.state).toEqual({ kind: "value", value: 120 });
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

// Phase 112 — publicProfileStats is GONE, not emptied. Someone else's
// profile no longer carries a points row at all (see
// src/features/profile/services/profileStats.ts).
describe("no peer-visible statistics exist", () => {
  const source = readFileSync(join(__dirname, "../../src/features/profile/services/profileStats.ts"), "utf8");

  it("exports no public/peer profile stat builder", () => {
    expect(source).not.toMatch(/export function publicProfileStats/);
    expect(Object.keys(profileStatsModule)).not.toContain("publicProfileStats");
  });

  it("keeps the owner's own points, which are private self-progress", () => {
    const stats = ownProfileStats({
      friendCount: 3,
      incomingRequestCount: 0,
      totalPoints: 120,
      socialMetaStatus: "ready",
    });
    expect(stats.map((s) => s.key)).toContain("points");
  });

  it("labels no stat as a weekly score anywhere", () => {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(code).not.toMatch(/Haftalık/);
  });
});
