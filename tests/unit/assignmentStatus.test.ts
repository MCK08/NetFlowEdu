import { resolveAssignmentDisplayStatus } from "../../src/features/assignments/services/assignmentStatus";

const NOW = 1_700_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

describe("resolveAssignmentDisplayStatus", () => {
  it("is draft regardless of dueAt", () => {
    expect(resolveAssignmentDisplayStatus("draft", NOW - DAY_MS, NOW)).toBe("draft");
    expect(resolveAssignmentDisplayStatus("draft", null, NOW)).toBe("draft");
  });

  it("is archived regardless of dueAt, even a future one", () => {
    expect(resolveAssignmentDisplayStatus("archived", NOW + DAY_MS, NOW)).toBe("archived");
  });

  it("is active for a published assignment with no due date", () => {
    expect(resolveAssignmentDisplayStatus("published", null, NOW)).toBe("active");
  });

  it("is active for a published assignment whose due date has not passed", () => {
    expect(resolveAssignmentDisplayStatus("published", NOW + DAY_MS, NOW)).toBe("active");
  });

  it("is past_due for a published assignment whose due date has passed", () => {
    expect(resolveAssignmentDisplayStatus("published", NOW - DAY_MS, NOW)).toBe("past_due");
  });

  it("is active exactly at the due boundary (not yet past)", () => {
    expect(resolveAssignmentDisplayStatus("published", NOW, NOW)).toBe("active");
  });

  it("never mutates stored status — this is purely a display derivation, tested via repeated calls", () => {
    const a = resolveAssignmentDisplayStatus("published", NOW - DAY_MS, NOW);
    const b = resolveAssignmentDisplayStatus("published", NOW - DAY_MS, NOW);
    expect(a).toBe(b);
    expect(a).toBe("past_due");
  });
});
