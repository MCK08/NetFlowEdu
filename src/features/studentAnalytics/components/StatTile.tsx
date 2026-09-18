import { memo } from "react";
import { Text } from "react-native";

import { Card } from "@components/ui/Card";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

interface StatTileProps {
  value: string;
  label: string;
  /** The whole fact as one sentence, e.g. "Çözme oranı yüzde 62, 40 kayıtlı denemeden". */
  accessibilityLabel: string;
  /** Row layout shares width; stacked layout takes the full column. */
  stacked: boolean;
}

// Phase 107 — a small, quiet statistic. Deliberately the same weight as its
// neighbours: no single number is allowed to dominate the summary.
export const StatTile = memo(function StatTile({ value, label, accessibilityLabel, stacked }: StatTileProps) {
  useThemeSubscription();
  return (
    <Card
      variant="outlined"
      style={stacked ? styles.stacked : styles.inRow}
    >
      <Text style={styles.value} accessible accessibilityLabel={accessibilityLabel}>
        {value}
      </Text>
      <Text style={styles.label} importantForAccessibility="no" accessibilityElementsHidden>
        {label}
      </Text>
    </Card>
  );
});

const styles = themedStyles(() => ({
  inRow: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  stacked: {
    gap: spacing.xxs,
  },
  value: {
    ...typography.title,
    color: colors.textPrimary,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
  },
}));
