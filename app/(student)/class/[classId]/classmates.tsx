import { useLocalSearchParams } from "expo-router";

import { ClassmatesScreen } from "@features/classes";
import { useThemeSubscription } from "@theme/ThemeProvider";

// Phase 110 — "Sınıf Arkadaşların": the class's own roster, public identity only.
export default function StudentClassmates() {
  useThemeSubscription();
  const { classId } = useLocalSearchParams<{ classId: string }>();
  return <ClassmatesScreen classId={classId} />;
}
