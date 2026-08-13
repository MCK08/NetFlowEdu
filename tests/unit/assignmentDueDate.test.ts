import { endOfLocalDay, isPastDue } from "../../src/features/assignments/services/assignmentDueDate";

describe("endOfLocalDay", () => {
  it("produces the last millisecond of the given day", () => {
    const ms = endOfLocalDay(2026, 3, 15);
    const date = new Date(ms);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(2); // 0-based
    expect(date.getDate()).toBe(15);
    expect(date.getHours()).toBe(23);
    expect(date.getMinutes()).toBe(59);
    expect(date.getSeconds()).toBe(59);
  });

  it("handles a year/month boundary correctly (local midnight rollover)", () => {
    const ms = endOfLocalDay(2025, 12, 31);
    const date = new Date(ms);
    expect(date.getFullYear()).toBe(2025);
    expect(date.getMonth()).toBe(11);
    expect(date.getDate()).toBe(31);
  });

  it("is deterministic for the same input", () => {
    expect(endOfLocalDay(2026, 1, 1)).toBe(endOfLocalDay(2026, 1, 1));
  });
});

describe("isPastDue", () => {
  const NOW = 1_700_000_000_000;
  const DAY_MS = 24 * 60 * 60 * 1000;

  it("is false when there is no due date at all", () => {
    expect(isPastDue(null, NOW)).toBe(false);
  });

  it("is false before the due instant", () => {
    expect(isPastDue(NOW + DAY_MS, NOW)).toBe(false);
  });

  it("is true after the due instant", () => {
    expect(isPastDue(NOW - 1, NOW)).toBe(true);
  });

  it("is false exactly AT the due instant (strict, not >=)", () => {
    expect(isPastDue(NOW, NOW)).toBe(false);
  });

  it("is false for an invalid (NaN) due date rather than throwing or crashing a UI", () => {
    expect(isPastDue(Number.NaN, NOW)).toBe(false);
  });
});
