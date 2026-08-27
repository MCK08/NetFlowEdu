import { EditProfileScreen } from "@features/profile";
import { useThemeSubscription } from "@theme/ThemeProvider";

export default function EditProfile() {
  useThemeSubscription();
  return <EditProfileScreen />;
}
