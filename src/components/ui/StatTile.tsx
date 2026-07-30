import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors } from "@theme/colors";
import { typography } from "@theme/typography";

interface StatTileProps {
  value: string | number;
  label: string;
}

// Generalizes ProfileScreen's inline `friendStat`/`friendStatValue`/
// `friendStatLabel` styles (currently duplicated per-stat there) into a
// reusable tile any screen showing a number+caption pair can use.
export const StatTile = memo(function StatTile({ value, label }: StatTileProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 2,
  },
  value: {
    ...typography.title,
    color: colors.textPrimary,
  },
  label: {
    ...typography.caption,
    color: colors.textTertiary,
  },
});
