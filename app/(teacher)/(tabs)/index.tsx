import { TeacherClassesScreen } from "@features/classes";
import { useThemeSubscription } from "@theme/ThemeProvider";

export default function TeacherClassesTab() {
  useThemeSubscription();
  return <TeacherClassesScreen />;
}
