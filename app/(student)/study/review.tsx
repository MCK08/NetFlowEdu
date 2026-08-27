import { StudySessionScreen } from "@features/study";
import { useThemeSubscription } from "@theme/ThemeProvider";

export default function StudentReviewSession() {
  useThemeSubscription();
  return <StudySessionScreen mode="mandatory" />;
}
