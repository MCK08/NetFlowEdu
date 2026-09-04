import { LearningAtlasScreen } from "@features/study";
import { useThemeSubscription } from "@theme/ThemeProvider";

export default function StudentLearningAtlas() {
  useThemeSubscription();
  return <LearningAtlasScreen />;
}
