import { NotificationScreen } from "@features/notifications";
import { useThemeSubscription } from "@theme/ThemeProvider";

export default function TeacherNotifications() {
  useThemeSubscription();
  return <NotificationScreen role="teacher" />;
}
