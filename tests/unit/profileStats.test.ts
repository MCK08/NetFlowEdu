import { readFileSync } from "fs";
import { join } from "path";

import * as profileStatsModule from "@features/profile/services/profileStats";
import {
  formatCount,
  formatStatValue,
  ownProfileStats,
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

describe("ownProfileStats", () => {
  const base = {
    friendCount: 3,
    incomingRequestCount: 2,
    socialMetaStatus: "ready" as const,
  };

  // Phase 113 — "points" used to be third. It is gone, not replaced: no
  // score, no XP, no level took its place.
  it("exposes friends and incoming requests, and nothing resembling a score", () => {
    expect(ownProfileStats(base).map((s) => s.key)).toEqual(["friends", "requests"]);
    expect(ownProfileStats(base).map((s) => s.label)).toEqual(["Arkadaş", "Gelen İstek"]);
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
    // Every stat on this row shares the socialMeta status now, so there is
    // no third one left to be unaffected.
    expect(stats).toHaveLength(2);
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

  it("has no points stat left on the owner's profile either (Phase 113)", () => {
    const stats = ownProfileStats({ friendCount: 3, incomingRequestCount: 0, socialMetaStatus: "ready" });
    expect(stats.map((s) => s.key)).not.toContain("points");
    expect(stats.map((s) => s.label)).not.toContain("Puan");
  });

  it("labels no stat as a weekly score anywhere", () => {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(code).not.toMatch(/Haftalık/);
  });
});
