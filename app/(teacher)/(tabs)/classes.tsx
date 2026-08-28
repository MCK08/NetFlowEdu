import { TeacherClassesScreen } from "@features/classes";
import { useThemeSubscription } from "@theme/ThemeProvider";

// Phase 50 — the teacher's class list, moved off the index route so the
// launch feed can take it (§20). The screen itself is completely unchanged;
// only its route position moved, and the old destination still resolves
// because the tab layout registers this file explicitly.
export default function TeacherClassesTab() {
  useThemeSubscription();
  return <TeacherClassesScreen />;
}
