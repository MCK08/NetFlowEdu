import { Question } from "@/types/question";

// The one place question visibility is spelled in Turkish. Previously
// copy-pasted as a local `VISIBILITY_LABELS` map in both FeedCard.tsx and
// QuestionDetailCard.tsx — two maps that could drift independently. Mirrors
// utils/roleLabels.ts's pattern.
const VISIBILITY_LABELS: Record<Question["visibility"], string> = {
  private: "Sadece Ben",
  public: "Herkese Açık",
  class: "Sınıf",
};

export function visibilityLabel(visibility: Question["visibility"]): string {
  return VISIBILITY_LABELS[visibility];
}
