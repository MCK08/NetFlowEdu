import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { memo } from "react";
import { Text, View } from "react-native";

import { ClassRoom } from "@/types/class";
import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { Avatar } from "@components/ui/Avatar";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { shadows } from "@theme/shadows";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";

interface StudentClassCardProps {
  classRoom: ClassRoom;
}

// memo'd: rendered from StudentClassesScreen's FlatList — same reasoning
// as ClassCard's memo (join-modal state changes shouldn't re-render every
// card whose `classRoom` prop reference is unchanged).
export const StudentClassCard = memo(function StudentClassCard({ classRoom }: StudentClassCardProps) {
  // Phase 49 — memo() blocks prop-driven re-renders, but NOT context
  // updates; without this subscription this component would keep its
  // previous theme's styles after a live theme switch.
  useThemeSubscription();
  return (
    <AnimatedPressable
      style={[styles.card, shadows.sm]}
      onPress={() => router.push({ pathname: "/(student)/class/[classId]", params: { classId: classRoom.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${classRoom.name} sınıfını aç`}
    >
      <Avatar displayName={classRoom.name} size="lg" />
      <View style={styles.textColumn}>
        <Text style={styles.name} numberOfLines={1}>
          {classRoom.name}
        </Text>
        <View style={styles.memberRow}>
          <Ionicons name="people-outline" size={14} color={colors.textTertiary} />
          <Text style={styles.memberCount}>{classRoom.memberCount} üye</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </AnimatedPressable>
  );
});

const styles = themedStyles(() => ({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
  },
  textColumn: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  memberCount: {
    ...typography.caption,
    color: colors.textTertiary,
  },
}));
