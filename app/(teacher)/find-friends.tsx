import { FindFriendsScreen } from "@features/friends";
import { useThemeSubscription } from "@theme/ThemeProvider";

export default function TeacherFindFriends() {
  useThemeSubscription();
  return <FindFriendsScreen />;
}
