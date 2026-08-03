import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Divider } from "@components/ui/Divider";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { colors } from "@theme/colors";
import { typography } from "@theme/typography";

import { formatStatValue, ProfileStat } from "../services/profileStats";

interface ProfileStatsRowProps {
  stats: ProfileStat[];
}

// Renders whatever the pure stat derivation produced, including its
// three-way distinction between a real value, a value that is still
// loading and one that is genuinely unknowable. StatTile is not reused
// here because it can only express "a value" — it has no loading or
// unavailable representation, and adding one would change how it renders
// on the screens already using it.
export const ProfileStatsRow = memo(function ProfileStatsRow({ stats }: ProfileStatsRowProps) {
  return (
    <View style={styles.row}>
      {stats.map((stat, index) => (
        <View key={stat.key} style={styles.cellWrapper}>
          {index > 0 ? <Divider style={styles.verticalDivider} /> : null}
          <View
            style={styles.cell}
            accessible
            accessibilityLabel={
              stat.state.kind === "value"
                ? `${stat.label}: ${stat.state.value}`
                : stat.state.kind === "loading"
                  ? `${stat.label} yükleniyor`
                  : `${stat.label} bilgisi yok`
            }
          >
            {stat.state.kind === "loading" ? (
              <LoadingSkeleton width={28} height={20} borderRadius={6} />
            ) : (
              <Text style={styles.value}>{formatStatValue(stat.state)}</Text>
            )}
            <Text style={styles.label} numberOfLines={1}>
              {stat.label}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignSelf: "stretch",
    alignItems: "center",
  },
  cellWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  cell: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  verticalDivider: {
    width: StyleSheet.hairlineWidth,
    height: 26,
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
