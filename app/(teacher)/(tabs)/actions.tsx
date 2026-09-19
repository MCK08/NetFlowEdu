import { TeacherActionsScreen } from "@features/teacher";
import { useThemeSubscription } from "@theme/ThemeProvider";

// Phase 111 — "Aksiyonlar": the complete Action Center for the selected class.
export default function TeacherActions() {
  useThemeSubscription();
  return <TeacherActionsScreen />;
}
