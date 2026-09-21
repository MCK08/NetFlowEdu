import { SettingsScreen } from "@features/profile";
import { useThemeSubscription } from "@theme/ThemeProvider";

export default function StudentSettings() {
  useThemeSubscription();
  return <SettingsScreen />;
}
