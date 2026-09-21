import { AppearanceScreen } from "@features/profile";
import { useThemeSubscription } from "@theme/ThemeProvider";

export default function TeacherAppearance() {
  useThemeSubscription();
  return <AppearanceScreen />;
}
