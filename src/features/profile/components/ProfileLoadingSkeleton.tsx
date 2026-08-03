import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";

// Deterministic widths, declared once at module scope: a skeleton whose
// geometry changed between renders would shimmer AND resize, which reads
// as a glitch rather than as loading.
const IDENTITY_WIDTHS = [180, 120] as const;
const STAT_COUNT = 3;
const GRID_ROWS = 2;
const GRID_COLUMNS = 3;

interface ProfileLoadingSkeletonProps {
  // The content grid is square and sized by the caller's own column math,
  // so the skeleton matches the real grid exactly instead of guessing.
  gridItemSize: number;
  // The public profile has no action bar of its own above the content, so
  // it can skip that block.
  showActionBar?: boolean;
}

// Profile-shaped loading state: avatar, identity lines, stats, optional
// action bar, then a content grid — replacing the single centred spinner
// (public profile) and the bare three-tile grid strip (own profile).
export const ProfileLoadingSkeleton = memo(function ProfileLoadingSkeleton({
  gridItemSize,
  showActionBar = false,
}: ProfileLoadingSkeletonProps) {
  return (
    <View style={styles.container} accessible accessibilityLabel="Profil yükleniyor">
      <LoadingSkeleton width={96} height={96} borderRadius={48} />

      <View style={styles.identity}>
        {IDENTITY_WIDTHS.map((width) => (
          <LoadingSkeleton key={width} width={width} height={16} borderRadius={radius.sm} />
        ))}
      </View>

      <View style={styles.statsRow}>
        {Array.from({ length: STAT_COUNT }, (_, index) => (
          <View key={index} style={styles.statCell}>
            <LoadingSkeleton width={32} height={20} borderRadius={6} />
            <LoadingSkeleton width={48} height={10} borderRadius={4} />
          </View>
        ))}
      </View>

      {showActionBar ? (
        <View style={styles.actionRow}>
          <LoadingSkeleton width="48%" height={44} borderRadius={radius.pill} />
          <LoadingSkeleton width="48%" height={44} borderRadius={radius.pill} />
        </View>
      ) : null}

      <View style={styles.grid}>
        {Array.from({ length: GRID_ROWS * GRID_COLUMNS }, (_, index) => (
          <LoadingSkeleton
            key={index}
            width={gridItemSize}
            height={gridItemSize}
            borderRadius={radius.sm}
          />
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: spacing.md,
    paddingTop: spacing.lg,
  },
  identity: {
    alignItems: "center",
    gap: spacing.xs,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignSelf: "stretch",
    paddingHorizontal: spacing.lg,
  },
  statCell: {
    alignItems: "center",
    gap: spacing.xxs,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignSelf: "stretch",
    paddingHorizontal: spacing.lg,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 2,
    marginTop: spacing.xs,
  },
});
