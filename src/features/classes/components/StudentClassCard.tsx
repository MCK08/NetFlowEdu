import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { memo } from "react";
import { Text, View } from "react-native";

import { ClassRoom } from "@/types/class";
import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { Avatar } from "@components/ui/Avatar";
import { Badge } from "@components/ui/Badge";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";

interface StudentClassCardProps {
  classRoom: ClassRoom;
  /** Phase 118 — the class switcher picks a class rather than pushing its
   *  page, so the same row serves both. Absent, the row navigates as it
   *  always has. */
  onPress?: () => void;
  /** Phase 118 — the class currently being viewed, in the switcher. Carried
   *  by a mark AND the accessibility state, never by colour alone. */
  selected?: boolean;
}

// memo'd: rendered from StudentClassesScreen's FlatList — same reasoning
// as ClassCard's memo (join-modal state changes shouldn't re-render every
// card whose `classRoom` prop reference is unchanged).
//
// Phase 106 — the row shows only what the class document actually holds:
// its initial, its name, its member count and — when the teacher has
// archived it — that status as a word. No "last active", no teacher name
// (not on the document; fetching one per row is a read this list does not
// make today), no activity feed.
export const StudentClassCard = memo(function StudentClassCard({
  classRoom,
  onPress,
  selected,
}: StudentClassCardProps) {
  // Phase 49 — memo() blocks prop-driven re-renders, but NOT context
  // updates; without this subscription this component would keep its
  // previous theme's styles after a live theme switch.
  useThemeSubscription();
  const isArchived = classRoom.status === "archived";
  const memberLabel = `${classRoom.memberCount} üye`;
  const label = onPress
    ? `${classRoom.name} sınıfına geç. ${memberLabel}${isArchived ? ". Arşivlendi" : ""}`
    : `${classRoom.name} sınıfını aç. ${memberLabel}${isArchived ? ". Arşivlendi" : ""}`;

  return (
    <AnimatedPressable
      style={[styles.card, isArchived ? styles.cardArchived : null, selected ? styles.cardSelected : null]}
      onPress={
        onPress ??
        (() => router.push({ pathname: "/(student)/class/[classId]", params: { classId: classRoom.id } }))
      }
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
    >
      <Avatar displayName={classRoom.name} size="lg" />
      <View style={styles.textColumn}>
        <Text style={styles.name} numberOfLines={2}>
          {classRoom.name}
        </Text>
        <View style={styles.metaRow}>
          {/* Decorative: the row's own label already says the count. */}
          <Ionicons name="people-outline" size={iconSize.xs} color={colors.textTertiary} accessibilityElementsHidden />
          <Text style={styles.memberCount}>{memberLabel}</Text>
          {isArchived ? <Badge label="Arşivlendi" variant="neutral" /> : null}
        </View>
      </View>
      {selected ? (
        <Ionicons name="checkmark-circle" size={iconSize.md} color={colors.primary} accessibilityElementsHidden />
      ) : (
        <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textTertiary} accessibilityElementsHidden />
      )}
    </AnimatedPressable>
  );
});

const styles = themedStyles(() => ({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: minTouchTarget,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: spacing.md,
  },
  cardArchived: {
    opacity: 0.7,
  },
  cardSelected: {
    borderColor: colors.primary,
  },
  textColumn: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  name: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.xxs,
  },
  memberCount: {
    ...typography.caption,
    color: colors.textTertiary,
  },
}));
