import { buildClassTrend } from "../../src/features/teacher/services/classTrend";
import { StudyDay } from "../../src/features/study/services/studyService";

function day(dayKey: string, reviewCount: number, solvedCount: number, struggledCount: number): StudyDay {
  return { dayKey, reviewCount, solvedCount, struggledCount };
}

describe("buildClassTrend — insufficient data", () => {
  it("is insufficient_data with no students at all", () => {
    expect(buildClassTrend([])).toBe("insufficient_data");
  });

  it("is insufficient_data with only a couple of total reviews across the whole class", () => {
    const perStudent = [[day("2024-01-10", 2, 1, 1)]];
    expect(buildClassTrend(perStudent)).toBe("insufficient_data");
  });

  it("is insufficient_data for a sparse, single-day sample even with several students", () => {
    const perStudent = [[day("2024-01-10", 1, 1, 0)], [day("2024-01-10", 1, 1, 0)]];
    expect(buildClassTrend(perStudent)).toBe("insufficient_data");
  });
});

describe("buildClassTrend — improving / declining, merged across students", () => {
  it("is improving when the class's combined recent days struggle less than earlier days", () => {
    // 3 students, each contributing real volume across two distinct day
    // buckets — merged, this should read as improving overall.
    const perStudent = [
      [day("2024-01-15", 5, 5, 0), day("2024-01-10", 5, 0, 5)],
      [day("2024-01-15", 5, 5, 0), day("2024-01-10", 5, 0, 5)],
      [day("2024-01-15", 5, 5, 0), day("2024-01-10", 5, 0, 5)],
    ];
    expect(buildClassTrend(perStudent)).toBe("improving");
  });

  it("is declining when the class's combined recent days struggle more than earlier days", () => {
    const perStudent = [
      [day("2024-01-15", 5, 0, 5), day("2024-01-10", 5, 5, 0)],
      [day("2024-01-15", 5, 0, 5), day("2024-01-10", 5, 5, 0)],
      [day("2024-01-15", 5, 0, 5), day("2024-01-10", 5, 5, 0)],
    ];
    expect(buildClassTrend(perStudent)).toBe("declining");
  });
});

describe("buildClassTrend — merging correctness", () => {
  it("sums same-day buckets from different students into one combined day, not separate ones", () => {
    // If merging were broken (e.g. treated as separate days instead of
    // summed), this small per-student sample would stay insufficient_data;
    // summed together it has real combined volume across two real days.
    const perStudent = [
      [day("2024-01-15", 3, 3, 0), day("2024-01-10", 3, 0, 3)],
      [day("2024-01-15", 3, 3, 0), day("2024-01-10", 3, 0, 3)],
    ];
    const trend = buildClassTrend(perStudent);
    expect(trend).not.toBe("insufficient_data");
  });

  it("handles students with completely non-overlapping active days", () => {
    const perStudent = [
      [day("2024-01-15", 5, 5, 0)],
      [day("2024-01-10", 5, 0, 5)],
      [day("2024-01-05", 5, 5, 0)],
    ];
    expect(() => buildClassTrend(perStudent)).not.toThrow();
  });

  it("ignores students who contributed zero day buckets", () => {
    const perStudent = [
      [day("2024-01-15", 5, 5, 0), day("2024-01-10", 5, 0, 5)],
      [],
      [day("2024-01-15", 5, 5, 0), day("2024-01-10", 5, 0, 5)],
    ];
    expect(() => buildClassTrend(perStudent)).not.toThrow();
  });
});

describe("buildClassTrend — determinism and no mutation", () => {
  it("is deterministic for the same input", () => {
    const perStudent = [[day("2024-01-15", 5, 5, 0), day("2024-01-10", 5, 0, 5)]];
    expect(buildClassTrend(perStudent)).toBe(buildClassTrend(perStudent));
  });

  it("does not mutate the input arrays", () => {
    const perStudent = [[day("2024-01-15", 5, 5, 0)]];
    const copy = JSON.parse(JSON.stringify(perStudent));
    buildClassTrend(perStudent);
    expect(perStudent).toEqual(copy);
  });
});
