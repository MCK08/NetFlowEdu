import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";

interface StudentSignalCardProps {
  displayName: string;
  // The reason line comes from studentAttention.ts's own fixed REASONS
  // table — a real, checkable statement about the data. This component
  // never composes or interprets it (§41's "no causal claims").
  reason: string;
  onPress: () => void;
}

// Phase 50 — a teacher-feed card for one student who needs attention.
//
// Deliberately NOT a dashboard tile: it carries a name, one already-written
// reason sentence, and a single action that opens the EXISTING Student
// Performance screen where the full evidence lives. It computes nothing,
// aggregates nothing, and claims no causality — the feed is an entry point
// (§19), not a second analytics surface.
function StudentSignalCardComponent({ displayName, reason, onPress }: StudentSignalCardProps) {
  useThemeSubscription();

  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${displayName} öğrencisini incele`}
    >
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.primary} />
        </View>
        <View style={styles.textColumn}>
          <Text style={styles.name} numberOfLines={1}>
            {displayName}
          </Text>
          {reason ? (
            <Text style={styles.reason} numberOfLines={2}>
              {reason}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      </View>
    </Pressable>
  );
}

export const StudentSignalCard = memo(StudentSignalCardComponent);

const styles = themedStyles(() => ({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 44,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  textColumn: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  reason: {
    ...typography.caption,
    color: colors.textSecondary,
  },
}));
