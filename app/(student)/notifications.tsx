import { NotificationScreen } from "@features/notifications";
import { useThemeSubscription } from "@theme/ThemeProvider";

export default function StudentNotifications() {
  useThemeSubscription();
  return <NotificationScreen role="student" />;
}
