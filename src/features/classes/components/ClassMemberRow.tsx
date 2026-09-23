import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Alert, Text, View } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { Avatar } from "@components/ui/Avatar";
import { colors } from "@theme/colors";
import { iconSize, minTouchTarget } from "@theme/sizes";
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
export const ClassMemberRow = memo(function ClassMemberRow({
  member,
  canRemove,
  onRemove,
  onOpen,
}: ClassMemberRowProps) {
  useThemeSubscription();
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
      <View style={styles.nameColumn}>
        <Text style={styles.name}>{identity.primaryName}</Text>
        {identity.usernameHandle ? <Text style={styles.handle}>{identity.usernameHandle}</Text> : null}
      </View>
      <Text style={styles.role}>{roleLabel(member.role)}</Text>
    </>
  );

  return (
    <View style={styles.row}>
      {onOpen ? (
        <AnimatedPressable
          onPress={() => onOpen(member)}
          style={styles.person}
          accessibilityRole="button"
          accessibilityLabel={spoken}
          accessibilityHint="Öğrencinin performans ekranını açar"
        >
          {body}
          {/* Decorative: the row's own hint says what it opens. */}
          <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textTertiary} accessibilityElementsHidden />
        </AnimatedPressable>
      ) : (
        <View style={styles.person} accessible accessibilityLabel={spoken}>
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
  nameColumn: {
    flex: 1,
    minWidth: 0,
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
