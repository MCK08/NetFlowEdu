import { Text, View } from "react-native";

import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

// Phase 107 — the two non-content states every analytics screen shares.
//
// A technical failure must never read as "not enough evidence yet": one is our
// problem, the other is a statement about the student. So the error is its own
// banner (an alert, in the danger tint), and the loading state is neutral
// blocks that imply no result at all.

export function AnalyticsErrorBanner({ title, message }: { title: string; message: string }) {
  useThemeSubscription();
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.bannerTitle}>{title}</Text>
      <Text style={styles.bannerText}>{message}</Text>
    </View>
  );
}

export function AnalyticsLoading({ blocks = 3 }: { blocks?: number }) {
  useThemeSubscription();
  return (
    <View style={styles.loading} accessibilityLabel="Yükleniyor" accessible>
      {Array.from({ length: blocks }, (_, index) => (
        <LoadingSkeleton key={index} height={index === 0 ? 72 : 96} borderRadius={radius.xl} />
      ))}
    </View>
  );
}

const styles = themedStyles(() => ({
  banner: {
    backgroundColor: colors.dangerMuted,
    borderRadius: radius.lg,
    padding: spacing.sm,
    gap: 2,
  },
  bannerTitle: {
    ...typography.bodyStrong,
    color: colors.danger,
  },
  bannerText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  loading: {
    gap: spacing.sm,
  },
}));
