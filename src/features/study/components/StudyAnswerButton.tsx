import { router } from "expo-router";

import { PrimaryButton } from "@components/ui/PrimaryButton";
import { useNavigationGuard } from "@hooks/useNavigationGuard";
import { QuestionVisibility } from "@/types/question";

interface StudyAnswerButtonProps {
  questionId: string;
  visibility: QuestionVisibility;
}

// Phase 38 — the "Çöz"/"Cevapla" entry point the Feed already has
// (FeedCard's own "Çöz" pill opens QuestionDetailScreen, whose "Cevapla"
// button pushes this exact route — see QuestionDetailScreen.tsx's
// handleAnswer) was missing from Ödev/Çalış entirely: self-assessment
// (Tekrar Et/Zorlandım/Çözdüm) let a student judge how they did, but gave
// them no way to actually SUBMIT a real photo/drawing answer without
// leaving the session and finding the question elsewhere. This reuses the
// exact same route, guard, and AnswerScreen/moderation pipeline — no new
// answer-submission system, same one every other surface already uses.
//
// A shared component (not copy-pasted into each swipe card) because both
// StudySessionAdaptiveCard and StudySessionMandatoryCard need the identical
// navigation, and a second independent copy of this guard is exactly how
// the double-push bug QuestionDetailScreen's own comment describes could
// come back.
export function StudyAnswerButton({ questionId, visibility }: StudyAnswerButtonProps) {
  const guardedNavigate = useNavigationGuard();

  function handleAnswer() {
    guardedNavigate("answer", () => {
      router.push({
        pathname: "/(student)/answer/[questionId]",
        params: { questionId, visibility },
      });
    });
  }

  return (
    <PrimaryButton
      label="Cevapla"
      variant="secondary"
      onPress={handleAnswer}
      accessibilityHint="Bu soru için fotoğraf veya çizim cevabı gönder"
    />
  );
}
