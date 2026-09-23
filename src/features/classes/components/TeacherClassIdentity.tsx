import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Text, useWindowDimensions, View } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { Avatar } from "@components/ui/Avatar";
import { Badge } from "@components/ui/Badge";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget, stackAtFontScale } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";
import type { ClassRoom } from "@/types/class";

import { ShareCodeButton } from "./ShareCodeButton";

interface TeacherClassIdentityProps {
  classRoom: ClassRoom;
  /** The owning teacher's own write: absent while a mutation is in flight,
   *  and for an archived class, where no client write is permitted. */
  onRegenerateCode?: () => void;
  isMutating: boolean;
}

export const TEACHER_CLASS_ARCHIVED_BADGE = "Arşivlendi";
export const TEACHER_CLASS_ARCHIVED_NOTE = "Bu sınıf arşivlendi; yeni içerik eklenemez.";

// Phase 123 — which class am I looking at, and the one thing a teacher opens
// it to hand out.
//
// Every field is the class document's own: name, memberCount, joinCode,
// status. Nothing is invented — the document holds no subject, grade,
// section, school or level, so none is drawn (the mockup's example values are
// not product truth). The join code keeps the prominence it has always had
// here, now beside the same Share the class list already offers and the same
// "Yenile" this screen already owned.
//
// The teacher's sibling of ClassIdentityCard (Phase 118): the student's card
// names the teacher, this one names the code and its two writes.
export const TeacherClassIdentity = memo(function TeacherClassIdentity({
  classRoom,
  onRegenerateCode,
  isMutating,
}: TeacherClassIdentityProps) {
  useThemeSubscription();
  const { fontScale } = useWindowDimensions();
  // Past the accessibility sizes the code, its label and two controls cannot
  // share a row: the column takes the width instead of shrinking the code,
  // which is the one token that must stay readable aloud to a room.
  const stacked = fontScale >= stackAtFontScale;
  const isArchived = classRoom.status !== "active";
  const memberLabel = `${classRoom.memberCount} üye`;

  return (
    <View style={styles.card}>
      <View style={[styles.head, stacked ? styles.headStacked : null]}>
        <Avatar displayName={classRoom.name} size="md" />
        <View style={styles.text} accessible accessibilityLabel={`${classRoom.name}. ${memberLabel}.${isArchived ? ` ${TEACHER_CLASS_ARCHIVED_BADGE}.` : ""}`}>
          {/* The name wraps rather than truncating: it is what the page is about. */}
          <Text style={styles.title}>{classRoom.name}</Text>
          <View style={styles.metaRow}>
            {/* Decorative: the node's own label already speaks the count. */}
            <Ionicons name="people-outline" size={iconSize.xs} color={colors.textTertiary} accessibilityElementsHidden />
            <Text style={styles.meta}>{memberLabel}</Text>
          </View>
          {isArchived ? (
            <View style={styles.badgeRow}>
              <Badge label={TEACHER_CLASS_ARCHIVED_BADGE} variant="neutral" />
            </View>
          ) : null}
        </View>
      </View>

      <View style={[styles.codeRow, stacked ? styles.codeRowStacked : null]}>
        <View style={styles.codeText} accessible accessibilityLabel={`Sınıf kodu ${classRoom.joinCode}`}>
          <Text style={styles.codeLabel}>Sınıf Kodu</Text>
          {/* One whole token, never wrapped mid-code. */}
          <Text style={styles.code}>{classRoom.joinCode}</Text>
        </View>
        <View style={styles.codeActions}>
          <ShareCodeButton className={classRoom.name} joinCode={classRoom.joinCode} />
          {onRegenerateCode ? (
            <AnimatedPressable
              onPress={onRegenerateCode}
              disabled={isMutating}
              style={styles.regenerate}
              accessibilityRole="button"
              accessibilityLabel="Katılım kodunu yenile"
              accessibilityHint="Yeni bir kod oluşturur; eski kod geçersiz olur"
              accessibilityState={{ disabled: isMutating, busy: isMutating }}
            >
              {/* Decorative: the control is labelled in words. */}
              <Ionicons name="refresh" size={iconSize.xs} color={colors.primary} accessibilityElementsHidden />
              <Text style={styles.regenerateText}>Yenile</Text>
            </AnimatedPressable>
          ) : null}
        </View>
      </View>

      {isArchived ? (
        <Text style={styles.archivedNote} accessibilityLiveRegion="polite">
          {TEACHER_CLASS_ARCHIVED_NOTE}
        </Text>
      ) : null}
    </View>
  );
});

const styles = themedStyles(() => ({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.sm,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  headStacked: {
    flexDirection: "column",
    alignItems: "flex-start",
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    ...typography.screenTitleSm,
    color: colors.textPrimary,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  meta: {
    ...typography.caption,
    color: colors.textTertiary,
    flexShrink: 1,
  },
  badgeRow: {
    flexDirection: "row",
    marginTop: spacing.xxs,
  },
  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  codeRowStacked: {
    flexDirection: "column",
    alignItems: "flex-start",
  },
  codeText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  codeLabel: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  code: {
    // A join code is a short machine token read aloud to a room, not a
    // heading: cardTitle's size and weight, with the tracking kept.
    ...typography.cardTitle,
    color: colors.textPrimary,
    letterSpacing: 2,
  },
  codeActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  regenerate: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.xs,
  },
  regenerateText: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.primary,
  },
  archivedNote: {
    ...typography.caption,
    color: colors.textSecondary,
  },
}));
