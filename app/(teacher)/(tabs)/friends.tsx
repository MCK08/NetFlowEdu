import { FriendsScreen } from "@features/friends";
import { useThemeSubscription } from "@theme/ThemeProvider";

export default function TeacherFriendsTab() {
  useThemeSubscription();
  return <FriendsScreen showBackButton={false} />;
}
