import { CommunityDifficultQuestionsScreen } from "@features/communityDifficulty";
import { useThemeSubscription } from "@theme/ThemeProvider";

// Phase 108 — Toplulukta Zorlayıcı Sorular (anonymous aggregate only).
export default function StudentCommunityDifficultRoute() {
  useThemeSubscription();
  return <CommunityDifficultQuestionsScreen />;
}
