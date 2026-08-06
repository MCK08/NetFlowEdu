import {
  appendOperationId,
  hasProcessedOperation,
  isValidOperationId,
  MAX_TRACKED_OPERATION_IDS,
} from "../../functions/src/study/operationId";
import {
  DAILY_GOAL_PRESETS,
  MAX_DAILY_GOAL,
  MIN_DAILY_GOAL,
  validateDailyGoal,
} from "@features/study/services/dailyGoalValidation";

describe("isValidOperationId", () => {
  it("accepts the client-generated format", () => {
    expect(isValidOperationId("m3k9xz-a1b2c3d4")).toBe(true);
    expect(isValidOperationId("abcdefgh")).toBe(true);
  });

  it("rejects too-short, too-long and malformed values", () => {
    for (const bad of ["", "short", "x".repeat(65), "has spaces", "semi;colon", null, 42, {}]) {
      expect(isValidOperationId(bad)).toBe(false);
    }
  });
});

describe("hasProcessedOperation", () => {
  it("detects a replay", () => {
    expect(hasProcessedOperation(["a1b2c3d4", "e5f6g7h8"], "a1b2c3d4")).toBe(true);
  });

  it("is false for a new id, and safe for a missing/garbage ledger", () => {
    expect(hasProcessedOperation(["a1b2c3d4"], "zzzzzzzz")).toBe(false);
    expect(hasProcessedOperation(undefined, "zzzzzzzz")).toBe(false);
    expect(hasProcessedOperation("not-an-array", "zzzzzzzz")).toBe(false);
  });
});

describe("appendOperationId", () => {
  it("appends newest-last", () => {
    expect(appendOperationId(["a1b2c3d4"], "e5f6g7h8")).toEqual(["a1b2c3d4", "e5f6g7h8"]);
  });

  it("never stores a duplicate", () => {
    expect(appendOperationId(["a1b2c3d4"], "a1b2c3d4")).toEqual(["a1b2c3d4"]);
  });

  it("caps the ledger so it can never grow unbounded", () => {
    let ledger: string[] = [];
    for (let i = 0; i < MAX_TRACKED_OPERATION_IDS + 5; i++) {
      ledger = appendOperationId(ledger, `op-${i}-aaaa`);
    }
    expect(ledger).toHaveLength(MAX_TRACKED_OPERATION_IDS);
    // Oldest evicted, newest retained.
    expect(ledger[ledger.length - 1]).toBe(`op-${MAX_TRACKED_OPERATION_IDS + 4}-aaaa`);
  });

  it("tolerates a corrupted ledger without throwing", () => {
    expect(appendOperationId(undefined, "a1b2c3d4")).toEqual(["a1b2c3d4"]);
    expect(appendOperationId([1, null, "keepme1"] as unknown, "a1b2c3d4")).toEqual([
      "keepme1",
      "a1b2c3d4",
    ]);
  });
});

describe("validateDailyGoal (client mirror; server re-validates)", () => {
  it("accepts the exact boundaries", () => {
    expect(validateDailyGoal(String(MIN_DAILY_GOAL))).toEqual({ valid: true, value: 1 });
    expect(validateDailyGoal(String(MAX_DAILY_GOAL))).toEqual({ valid: true, value: 100 });
  });

  it("accepts every preset", () => {
    for (const preset of DAILY_GOAL_PRESETS) {
      expect(validateDailyGoal(String(preset))).toEqual({ valid: true, value: preset });
    }
  });

  it("rejects 0, 101, decimals, negatives and non-numeric text", () => {
    for (const bad of ["0", "101", "1.5", "-3", "abc", "12abc", "1e3", ""]) {
      expect(validateDailyGoal(bad).valid).toBe(false);
    }
  });

  it("does NOT silently clamp an out-of-range value", () => {
    const result = validateDailyGoal("500");
    expect(result.valid).toBe(false);
    // Would be { valid: true, value: 100 } if it clamped.
    expect(result).not.toHaveProperty("value");
  });

  it("trims surrounding whitespace", () => {
    expect(validateDailyGoal("  10  ")).toEqual({ valid: true, value: 10 });
  });
});
