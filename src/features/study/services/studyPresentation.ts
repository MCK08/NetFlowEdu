import { Ionicons } from "@expo/vector-icons";

import { StudyOutcome, StudyStatus } from "../domain/studyTypes";
import { PlanReason } from "./dailyPracticePlan";

// Pure presentation mapping — no React, no Firebase, directly unit-testable.

export interface OutcomeOption {
  outcome: StudyOutcome;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  accessibilityHint: string;
}

// Phase 18 — how long the success flourish holds the current card on screen
// before ReviewSessionScreen auto-advances to the next one. Long enough to
// register as a deliberate confirmation, short enough that the session still
// feels brisk over a queue of many questions. One named constant so the
// hook and any future surface reusing this pattern share the same feel
// instead of each hardcoding a number.
export const REVIEW_ADVANCE_DELAY_MS = 400;

// Order matters: hardest → easiest, matching how the buttons read left to
// right. "Çözdüm" sits last (rightmost) as the affirmative action.
export const OUTCOME_OPTIONS: readonly OutcomeOption[] = [
  {
    outcome: "again",
    label: "Tekrar Et",
    icon: "refresh-outline",
    accessibilityHint: "Bu soru birazdan tekrar sorulur",
  },
  {
    outcome: "struggled",
    label: "Zorlandım",
    icon: "alert-circle-outline",
    accessibilityHint: "Bu soru yarın tekrar sorulur",
  },
  {
    outcome: "solved",
    label: "Çözdüm",
    icon: "checkmark-circle-outline",
    accessibilityHint: "Bu sorunun tekrar aralığı uzar",
  },
] as const;

const STATUS_LABELS: Record<StudyStatus, string> = {
  learning: "Öğreniliyor",
  review: "Tekrarda",
  mastered: "Ustalaşıldı",
};

export function studyStatusLabel(status: StudyStatus): string {
  return STATUS_LABELS[status];
}

// Human-readable "when will I see this again". Deliberately coarse — an
// exact timestamp would imply a precision the scheduler doesn't promise.
export function formatNextReview(nextReviewAt: number, now: number): string {
  const deltaMs = nextReviewAt - now;
  if (deltaMs <= 0) return "Şimdi hazır";

  const minutes = Math.round(deltaMs / (60 * 1000));
  if (minutes < 60) return `${Math.max(1, minutes)} dakika sonra`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} saat sonra`;

  const days = Math.round(hours / 24);
  return `${days} gün sonra`;
}

// Progress toward today's goal, clamped to [0,1] so an over-achieved day
// never overflows a progress bar.
export function goalProgress(reviewedToday: number, dailyGoal: number): number {
  if (!Number.isFinite(dailyGoal) || dailyGoal <= 0) return 0;
  const safeReviewed = Number.isFinite(reviewedToday) && reviewedToday > 0 ? reviewedToday : 0;
  return Math.min(1, safeReviewed / dailyGoal);
}

export function goalProgressLabel(reviewedToday: number, dailyGoal: number): string {
  const safeReviewed = Number.isFinite(reviewedToday) && reviewedToday > 0 ? Math.floor(reviewedToday) : 0;
  const safeGoal = Number.isFinite(dailyGoal) && dailyGoal > 0 ? Math.floor(dailyGoal) : 0;
  return `${safeReviewed} / ${safeGoal}`;
}

// Turkish plural-free streak copy (Turkish doesn't inflect the noun after a
// numeral, so one form is correct for every count).
export function streakLabel(currentStreak: number): string {
  const safe = Number.isFinite(currentStreak) && currentStreak > 0 ? Math.floor(currentStreak) : 0;
  if (safe === 0) return "Seri yok";
  return `${safe} günlük seri`;
}

// Phase 23 — why a question is in today's plan. Every string here is
// metadata-independent and describes real recorded history (a due
// timestamp, a recorded outcome) — never a projection or invented
// probability (§16).
const PLAN_REASON_LABELS: Record<PlanReason, string> = {
  due: "Tekrar zamanı geldi",
  struggled: "Bu soruda zorlandın",
  weak_topic: "Bu konuda zorlanıyorsun",
  goal_fill: "Günlük hedefini tamamlamak için",
};

export function planReasonLabel(reason: PlanReason): string {
  return PLAN_REASON_LABELS[reason];
}

export function queueEmptyCopy(hasAnyStudyItem: boolean): { title: string; description: string } {
  if (!hasAnyStudyItem) {
    return {
      title: "Çalışma kuyruğun boş",
      description:
        "Bir soruyu açıp “Tekrar Et”, “Zorlandım” veya “Çözdüm” dediğinde soru buraya eklenir.",
    };
  }
  return {
    title: "Bugünlük tekrar kalmadı",
    description: "Tekrar zamanı gelen sorular burada görünecek. Yarın tekrar uğra.",
  };
}
