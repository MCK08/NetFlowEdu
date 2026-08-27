import { ProfileScreen } from "@features/profile";
import { useThemeSubscription } from "@theme/ThemeProvider";

export default function TeacherProfileTab() {
  useThemeSubscription();
  return <ProfileScreen />;
}
