import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Alert, Text, useWindowDimensions, View } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { Avatar } from "@components/ui/Avatar";
import { colors } from "@theme/colors";
import { iconSize, minTouchTarget, stackAtFontScale } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";
import { roleLabel } from "@utils/roleLabels";
import { resolvePublicIdentity } from "@utils/publicIdentity";
import { ClassMember } from "@/types/class";

interface ClassMemberRowProps {
  member: ClassMember;
  canRemove: boolean;
  onRemove: (uid: string) => void;
  /** Phase 123 — opens this student's canonical performance screen. Absent
   *  for the teacher's own row, which has no student screen. */
  onOpen?: (member: ClassMember) => void;
}

// One member of the class, as the owning teacher sees them.
//
// Operational identity only: the public name, the handle when there is one,
// and the role. No email, no score, no counts, no study history — the roster
// is a way to reach a student, not a surveillance readout (the student's own
// evidence lives behind their performance screen, which the row opens).
//
// Phase 123 — the name and handle used to be capped at one line each, so at
// the accessibility text sizes a real Turkish name was cut mid-word; they
// wrap now. The row is also the way into the student screen, which the roster
// previously dead-ended before.
//
// Phase 123 (runtime QA) — uncapping was not enough on its own. The role
// label kept its place on the SAME line, so the name column was left about
// half the row and the words broke inside themselves anyway ("Demo Öğret /
// men", "@demo / _teache / r"). Past the accessibility sizes the row is a
// column: the name takes the width, the role follows it, and nothing has to
// break mid-word. The remove control comes down with it — held beside the
// column it took 44pt off the width and broke the handle instead
// ("@demo_student_ / a").
export const ClassMemberRow = memo(function ClassMemberRow({
  member,
  canRemove,
  onRemove,
  onOpen,
}: ClassMemberRowProps) {
  useThemeSubscription();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= stackAtFontScale;
  const identity = resolvePublicIdentity(member);
  const spoken = `${identity.primaryName}${identity.usernameHandle ? `, ${identity.usernameHandle}` : ""}. ${roleLabel(member.role)}`;

  function confirmRemove() {
    Alert.alert(
      "Üyeyi çıkar",
      `${identity.primaryName} sınıftan çıkarmak istediğinize emin misiniz?`,
      [
        { text: "Vazgeç", style: "cancel" },
        { text: "Çıkar", style: "destructive", onPress: () => onRemove(member.uid) },
      ],
    );
  }

  const body = (
    <>
      <Avatar photoURL={member.photoURL} displayName={identity.primaryName} size="sm" />
      <View style={[styles.nameColumn, stacked ? styles.nameColumnStacked : null]}>
        <Text style={styles.name}>{identity.primaryName}</Text>
        {identity.usernameHandle ? <Text style={styles.handle}>{identity.usernameHandle}</Text> : null}
      </View>
      <Text style={styles.role}>{roleLabel(member.role)}</Text>
    </>
  );

  return (
    <View style={[styles.row, stacked ? styles.rowStacked : null]}>
      {onOpen ? (
        <AnimatedPressable
          onPress={() => onOpen(member)}
          style={[styles.person, stacked ? styles.personStacked : null]}
          accessibilityRole="button"
          accessibilityLabel={spoken}
          accessibilityHint="Öğrencinin performans ekranını açar"
        >
          {body}
          {/* Decorative: the row's own hint says what it opens. Dropped once
              the row stacks, where it would sit alone under the role. */}
          {stacked ? null : (
            <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textTertiary} accessibilityElementsHidden />
          )}
        </AnimatedPressable>
      ) : (
        <View style={[styles.person, stacked ? styles.personStacked : null]} accessible accessibilityLabel={spoken}>
          {body}
        </View>
      )}

      {canRemove && member.role !== "teacher" ? (
        <AnimatedPressable
          onPress={confirmRemove}
          style={styles.removeButton}
          accessibilityRole="button"
          accessibilityLabel="Üyeyi sınıftan çıkar"
          accessibilityHint={`${identity.primaryName} adlı üyeyi sınıftan çıkarır`}
        >
          <Ionicons name="close-circle-outline" size={iconSize.md} color={colors.danger} accessibilityElementsHidden />
        </AnimatedPressable>
      ) : null}
    </View>
  );
});

const styles = themedStyles(() => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  person: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: minTouchTarget,
    paddingVertical: spacing.sm,
  },
  rowStacked: {
    flexDirection: "column",
    alignItems: "flex-start",
    paddingBottom: spacing.xs,
  },
  personStacked: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.xxs,
    // Stacked, the person block is the row's full-width child.
    alignSelf: "stretch",
  },
  nameColumn: {
    flex: 1,
    minWidth: 0,
  },
  // Stacked, the column is the row's full-width child rather than one of
  // three things sharing a line.
  nameColumnStacked: {
    alignSelf: "stretch",
  },
  name: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  handle: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  role: {
    ...typography.caption,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  removeButton: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
}));
