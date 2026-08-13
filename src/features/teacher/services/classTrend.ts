import { buildLearningTrend, LearningTrend } from "@features/study/services/learningTrend";
import { StudyDay } from "@features/study/services/studyService";

// A class-wide trend, built by merging several students' ALREADY-COMPUTED
// per-day buckets (StudentPerformanceSnapshot.dayBuckets — see
// studentPerformance.ts) by dayKey, then running the exact same,
// UNMODIFIED buildLearningTrend the student-facing Learning Hub uses. This
// is never a second trend algorithm: "insufficient_data" for a small/sparse
// sample, and improving/stable/declining thresholds, are entirely
// buildLearningTrend's own — merging day-buckets across students is the
// only new logic here.

function mergeDayBuckets(perStudentBuckets: readonly (readonly StudyDay[])[]): StudyDay[] {
  const merged = new Map<string, { reviewCount: number; solvedCount: number; struggledCount: number }>();

  for (const studentBuckets of perStudentBuckets) {
    for (const day of studentBuckets) {
      const existing = merged.get(day.dayKey) ?? { reviewCount: 0, solvedCount: 0, struggledCount: 0 };
      existing.reviewCount += day.reviewCount;
      existing.solvedCount += day.solvedCount;
      existing.struggledCount += day.struggledCount;
      merged.set(day.dayKey, existing);
    }
  }

  // Newest dayKey first — matches getRecentStudyDays'/bucketItemsByDay's own
  // ordering contract, which buildLearningTrend already assumes.
  return [...merged.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dayKey, counts]) => ({ dayKey, ...counts }));
}

export function buildClassTrend(perStudentDayBuckets: readonly (readonly StudyDay[])[]): LearningTrend {
  return buildLearningTrend(mergeDayBuckets(perStudentDayBuckets));
}
