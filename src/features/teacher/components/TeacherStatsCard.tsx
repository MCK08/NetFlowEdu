import { StyleSheet, View } from "react-native";

import { Card } from "@components/ui/Card";
import { Divider } from "@components/ui/Divider";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { StatTile } from "@components/ui/StatTile";
import { spacing } from "@theme/spacing";

import { MEMBER_STAT_LABEL, TeacherDashboardStats } from "../services/teacherDashboardStats";

interface TeacherStatsCardProps {
  stats: TeacherDashboardStats;
  // While the class list is still loading the numbers are not "0" — they
  // are simply unknown, and rendering a confident 0 for data that was
  // never fetched is worse than rendering nothing. Skeletons stand in
  // until the real values exist.
  isLoading: boolean;
}

export function TeacherStatsCard({ stats, isLoading }: TeacherStatsCardProps) {
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        {isLoading ? (
          <>
            <StatSkeleton />
            <Divider style={styles.verticalDivider} />
            <StatSkeleton />
            <Divider style={styles.verticalDivider} />
            <StatSkeleton />
          </>
        ) : (
          <>
            <View style={styles.cell}>
              <StatTile value={stats.classCount} label="Sınıf" />
            </View>
            <Divider style={styles.verticalDivider} />
            <View style={styles.cell}>
              <StatTile value={stats.activeClassCount} label="Aktif" />
            </View>
            <Divider style={styles.verticalDivider} />
            <View style={styles.cell}>
              <StatTile value={stats.memberCount} label={MEMBER_STAT_LABEL} />
            </View>
          </>
        )}
      </View>
    </Card>
  );
}

function StatSkeleton() {
  return (
    <View style={[styles.cell, styles.skeletonCell]}>
      <LoadingSkeleton width={32} height={20} borderRadius={6} />
      <LoadingSkeleton width={44} height={10} borderRadius={4} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  cell: {
    flex: 1,
  },
  skeletonCell: {
    alignItems: "center",
    gap: spacing.xxs,
  },
  verticalDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
  },
});
