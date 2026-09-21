import { AppearanceScreen } from "@features/profile";
import { useThemeSubscription } from "@theme/ThemeProvider";

export default function StudentAppearance() {
  useThemeSubscription();
  return <AppearanceScreen />;
}
