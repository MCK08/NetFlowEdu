import { AccountInfoScreen } from "@features/profile";
import { useThemeSubscription } from "@theme/ThemeProvider";

export default function TeacherAccountInfo() {
  useThemeSubscription();
  return <AccountInfoScreen />;
}
