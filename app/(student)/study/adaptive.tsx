import { StudySessionScreen } from "@features/study";
import { useThemeSubscription } from "@theme/ThemeProvider";

export default function StudentAdaptiveSession() {
  useThemeSubscription();
  return <StudySessionScreen mode="adaptive" />;
}
