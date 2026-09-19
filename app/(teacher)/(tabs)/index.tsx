import { TeacherTodayScreen } from "@features/teacher";
import { useThemeSubscription } from "@theme/ThemeProvider";

// Phase 111 — "Bugün": where a teacher lands.
export default function TeacherToday() {
  useThemeSubscription();
  return <TeacherTodayScreen />;
}
