import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card } from "@components/ui/Card";
import { SectionHeader } from "@components/ui/SectionHeader";
import { StatusLabel } from "@components/ui/StatusLabel";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";

import { SubjectSummary } from "../services/learningInsights";
import { useThemeSubscription } from "@theme/ThemeProvider";

interface SubjectBreakdownSectionProps {
  subjects: readonly SubjectSummary[];
}

// "Derslere göre durum" — deliberately plain counts (dueCount/masteredCount
// out of totalCount), never a percentage. A percentage here would be the
// exact fake-precision the phase spec calls out ("%73 öğrendin" for data
// that supports no such number) — these three counts are each real and
// individually meaningful without implying a false level of confidence.
export const SubjectBreakdownSection = memo(function SubjectBreakdownSection({
  subjects,
}: SubjectBreakdownSectionProps) {
  // Phase 49 — memo() blocks prop-driven re-renders, but NOT context
  // updates; without this subscription this component would keep its
  // previous theme's styles after a live theme switch.
  useThemeSubscription();
  if (subjects.length === 0) return null;

  return (
    <View style={styles.container}>
      <SectionHeader title="Derslere göre durum" />
      <Card variant="outlined" style={styles.card}>
        {subjects.map((subject, index) => (
          <View
            key={subject.subject}
            style={[styles.row, index > 0 ? styles.rowDivider : null]}
            accessible
            accessibilityLabel={`${subject.subject}: ${subject.dueCount} tekrar gerekiyor, ${subject.masteredCount} öğrenildi, toplam ${subject.totalCount} soru.`}
          >
            <Text style={styles.subject} numberOfLines={1}>
              {subject.subject}
            </Text>
            {/* Phase 106 — the two counts as mark + words (the same
                StatusLabel vocabulary the teacher surfaces use), so neither
                depends on its colour to be understood. */}
            <View style={styles.countsColumn}>
              {subject.dueCount > 0 ? (
                <StatusLabel icon="time-outline" tone="danger" textStyle={styles.dueText}>
                  {`${subject.dueCount} tekrar gerekiyor`}
                </StatusLabel>
              ) : null}
              <StatusLabel icon="checkmark-circle-outline" tone="success" textStyle={styles.masteredText}>
                {`${subject.masteredCount} öğrenildi`}
              </StatusLabel>
            </View>
          </View>
        ))}
      </Card>
    </View>
  );
});

const styles = themedStyles(() => ({
  container: {
    gap: spacing.xs,
  },
  card: {
    gap: 0,
    paddingVertical: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  subject: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  countsColumn: {
    alignItems: "flex-end",
    gap: 2,
    flexShrink: 0,
  },
  dueText: {
    ...typography.caption,
    color: colors.danger,
  },
  masteredText: {
    ...typography.caption,
    color: colors.success,
  },
}));
