import { formatCount, formatRelativeTime } from "@utils/feedFormat";

describe("formatCount", () => {
  it("prints small counts verbatim", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(7)).toBe("7");
    expect(formatCount(999)).toBe("999");
  });

  it("abbreviates thousands so a large count cannot break the action rail's width", () => {
    expect(formatCount(1_000)).toBe("1.0B");
    expect(formatCount(12_400)).toBe("12.4B");
  });

  it("abbreviates millions", () => {
    expect(formatCount(1_000_000)).toBe("1.0M");
    expect(formatCount(3_500_000)).toBe("3.5M");
  });
});

describe("formatRelativeTime", () => {
  const NOW = new Date("2026-07-30T12:00:00Z").getTime();

  it("returns an empty string for a missing timestamp rather than 'Invalid Date'", () => {
    expect(formatRelativeTime(0, NOW)).toBe("");
  });

  it("shows 'şimdi' for anything under a minute old", () => {
    expect(formatRelativeTime(NOW - 5_000, NOW)).toBe("şimdi");
  });

  it("never renders a negative age when the server timestamp is slightly ahead of the device clock", () => {
    expect(formatRelativeTime(NOW + 30_000, NOW)).toBe("şimdi");
  });

  it("counts minutes, then hours, then days", () => {
    expect(formatRelativeTime(NOW - 5 * 60_000, NOW)).toBe("5 dk");
    expect(formatRelativeTime(NOW - 3 * 3_600_000, NOW)).toBe("3 sa");
    expect(formatRelativeTime(NOW - 2 * 86_400_000, NOW)).toBe("2 g");
  });

  it("falls back to an absolute date once a question is older than a week", () => {
    const old = NOW - 30 * 86_400_000;
    const formatted = formatRelativeTime(old, NOW);
    expect(formatted).not.toMatch(/dk|sa|şimdi/);
    expect(formatted).toMatch(/\d{2}\.\d{2}\.\d{4}/);
  });

  it("switches from days to a date exactly at the one-week boundary", () => {
    expect(formatRelativeTime(NOW - 6 * 86_400_000, NOW)).toBe("6 g");
    expect(formatRelativeTime(NOW - 7 * 86_400_000, NOW)).toMatch(/\d{2}\.\d{2}\.\d{4}/);
  });
});
