import { memo, useMemo } from "react";
import { View } from "react-native";

import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import type { Question } from "@/types/question";

import { useClassSocial } from "../hooks/useClassSocial";
import { buildClassActivity, buildClassmates, otherStudentCount } from "../services/classSocial";
import { ClassActivitySection } from "./ClassActivitySection";
import { ClassmatesPreview } from "./ClassmatesPreview";
import { ClassPulseCard } from "./ClassPulseCard";

interface ClassSocialSectionsProps {
  classId: string;
  /** The class questions the screen already loaded — reused, not re-read. */
  questions: readonly Question[];
}

// Phase 110 — the class screen's social layer, as one insertion: classmates,
// the week's collective progress, and the class's recent activity. Kept in its
// own component so the class screen gains a single element rather than a
// second set of loaders and state.
export const ClassSocialSections = memo(function ClassSocialSections({ classId, questions }: ClassSocialSectionsProps) {
  useThemeSubscription();
  const social = useClassSocial(classId);

  const classmates = useMemo(() => buildClassmates(social.members, social.uid), [social.members, social.uid]);
  const now = social.loadedAt;
  const events = useMemo(
    () =>
      buildClassActivity({
        classId,
        currentUid: social.uid,
        members: social.members,
        questions,
        assignments: social.assignments,
      }),
    [classId, social.uid, social.members, questions, social.assignments],
  );

  return (
    <View style={styles.stack}>
      <ClassmatesPreview
        classId={classId}
        classmates={classmates}
        otherStudents={otherStudentCount(classmates)}
        error={social.isLoading ? null : social.error}
      />
      <ClassPulseCard pulse={social.pulse} />
      <ClassActivitySection
        events={events}
        now={now}
        congratulated={social.congratulated}
        pendingQuestionId={social.pendingQuestionId}
        kudosError={social.kudosError}
        onCongratulate={social.congratulate}
      />
    </View>
  );
});

const styles = themedStyles(() => ({
  stack: {
    gap: spacing.md,
  },
}));
