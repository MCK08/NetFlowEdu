import { StudentClassesScreen } from "@features/classes";
import { useThemeSubscription } from "@theme/ThemeProvider";

export default function ClassesTab() {
  useThemeSubscription();
  return <StudentClassesScreen />;
}
