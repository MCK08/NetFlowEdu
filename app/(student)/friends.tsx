import { FriendsScreen } from "@features/friends";
import { useThemeSubscription } from "@theme/ThemeProvider";

export default function StudentFriends() {
  useThemeSubscription();
  return <FriendsScreen />;
}
