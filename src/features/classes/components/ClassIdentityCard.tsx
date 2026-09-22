import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";

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

interface ClassIdentityCardProps {
  classRoom: ClassRoom;
  /** The class's teacher, when the roster this screen already read names one.
   *  Never fetched for this card. */
  teacherName: string | null;
  /** Present only when there is somewhere to go: another joined class to
   *  switch to. Absent, the card is a statement rather than a control. */
  onPress?: () => void;
}

// Phase 118 — which class am I looking at, in one object.
//
// It replaces a centred hero: a 96pt avatar, the name under it and the member
// count under that took the top third of the page to say one line's worth.
// The same three facts now read across, and every one of them is the class
// document's own (name, memberCount, status) or the roster's (the teacher's
// display name, which the classmates row beside it already shows). Nothing
// here is fetched for this card, and nothing is invented: no subject, no
// grade, no school, no description — the class document holds none of them.
export const ClassIdentityCard = memo(function ClassIdentityCard({
  classRoom,
  teacherName,
  onPress,
}: ClassIdentityCardProps) {
  useThemeSubscription();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= stackAtFontScale;
  const isArchived = classRoom.status === "archived";
  const memberLabel = `${classRoom.memberCount} üye`;
  // The teacher's name joins the count only when the roster actually named
  // one; a class whose roster has not loaded says the count alone.
  const meta = teacherName ? `${teacherName} · ${memberLabel}` : memberLabel;
  const spoken = `${classRoom.name}. ${meta}.${isArchived ? " Arşivlendi." : ""}`;

  const body = (
    <>
      <Avatar displayName={classRoom.name} size="md" />
      <View style={styles.text}>
        <Text style={styles.title}>{classRoom.name}</Text>
        <Text style={styles.meta}>{meta}</Text>
        {isArchived ? (
          <View style={styles.badgeRow}>
            <Badge label="Arşivlendi" variant="neutral" />
          </View>
        ) : null}
      </View>
      {onPress ? (
        /* Decorative: the control's own label says it changes class. */
        <Ionicons
          name="chevron-forward"
          size={iconSize.sm}
          color={colors.textTertiary}
          accessibilityElementsHidden
        />
      ) : null}
    </>
  );

  if (!onPress) {
    return (
      <View style={[styles.card, stacked ? styles.cardStacked : null]} accessible accessibilityLabel={spoken}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, stacked ? styles.cardStacked : null]}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint="Başka bir sınıfa geçmek için sınıflarını açar"
    >
      {body}
    </Pressable>
  );
});

const styles = themedStyles(() => ({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
  },
  // Past the accessibility text sizes a name, a teacher and a count cannot
  // share a row with an avatar; the column gives each of them the full width.
  cardStacked: {
    flexDirection: "column",
    alignItems: "flex-start",
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  meta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  badgeRow: {
    flexDirection: "row",
    marginTop: spacing.xxs,
  },
}));
