import { FriendsScreen } from "@features/friends";
import { useThemeSubscription } from "@theme/ThemeProvider";

// Phase 111 — no longer a tab: reached from Profil, with the shared way back.
export default function TeacherFriends() {
  useThemeSubscription();
  return <FriendsScreen />;
}
