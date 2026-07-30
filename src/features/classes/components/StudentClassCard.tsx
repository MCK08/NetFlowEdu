import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { ClassRoom } from "@/types/class";
import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { Avatar } from "@components/ui/Avatar";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { shadows } from "@theme/shadows";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

interface StudentClassCardProps {
  classRoom: ClassRoom;
}

export function StudentClassCard({ classRoom }: StudentClassCardProps) {
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
}

const styles = StyleSheet.create({
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
});
