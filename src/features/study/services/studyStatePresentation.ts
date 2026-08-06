import { HydratedStudyItem } from "./studyItemParser";
import { formatNextReview, studyStatusLabel } from "./studyPresentation";

// Turns hydrated scheduling state into the one short line the UI shows.
// Raw enum values (learning / review / mastered / again / struggled /
// solved) are NEVER rendered to the user.

export interface StudyStateSummary {
  // e.g. "Ustalaşıldı" — always present.
  statusLabel: string;
  // e.g. "Sonraki tekrar: 4 gün sonra" — null when not applicable.
  scheduleLabel: string | null;
  // Full sentence for screen readers.
  accessibilityLabel: string;
  isInPlan: boolean;
}

const NOT_IN_PLAN = "Henüz çalışma planında değil";

export function summarizeStudyState(
  item: HydratedStudyItem | null,
  now: number,
): StudyStateSummary {
  if (!item) {
    return {
      statusLabel: NOT_IN_PLAN,
      scheduleLabel: null,
      accessibilityLabel: `${NOT_IN_PLAN}. Bir seçenek seçerek bu soruyu çalışma planına ekleyebilirsin.`,
      isInPlan: false,
    };
  }

  // studyStatusLabel is the ONE status vocabulary. A second map here meant
  // "review" read as "Tekrarda" on the queue card and "Tekrar aşamasında"
  // under the question — the same state described two ways.
  const statusLabel = studyStatusLabel(item.status);
  const scheduleLabel =
    item.nextReviewAt !== null ? `Sonraki tekrar: ${formatNextReview(item.nextReviewAt, now)}` : null;

  return {
    statusLabel,
    scheduleLabel,
    accessibilityLabel: scheduleLabel ? `${statusLabel}. ${scheduleLabel}` : statusLabel,
    isInPlan: true,
  };
}
