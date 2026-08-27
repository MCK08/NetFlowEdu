import { useLocalSearchParams } from "expo-router";

import { CreateAssignmentScreen } from "@features/assignments/screens/CreateAssignmentScreen";
import { useThemeSubscription } from "@theme/ThemeProvider";

export default function TeacherCreateAssignment() {
  useThemeSubscription();
  const { classId, subject, topic, gradeLevel, studentIds, intervention } = useLocalSearchParams<{
    classId: string;
    subject?: string;
    topic?: string;
    gradeLevel?: string;
    studentIds?: string;
    // Phase 44 — explicit, narrow signal set ONLY by the two Phase 43
    // intervention CTAs (see CreateAssignmentScreen's own isIntervention
    // prop doc comment). Any value other than exactly "1" is treated as
    // absent — a malformed/unexpected query param must never accidentally
    // mark an ordinary assignment as an intervention.
    intervention?: string;
  }>();
  return (
    <CreateAssignmentScreen
      classId={classId}
      initialSubject={subject}
      initialTopic={topic}
      initialGradeLevel={gradeLevel}
      initialTargetStudentIds={studentIds}
      isIntervention={intervention === "1"}
    />
  );
}
