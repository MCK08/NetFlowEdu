import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card } from "@components/ui/Card";
import { SectionHeader } from "@components/ui/SectionHeader";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

import { SubjectSummary } from "../services/learningInsights";

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
  if (subjects.length === 0) return null;

  return (
    <View style={styles.container}>
      <SectionHeader title="Derslere göre durum" />
      <Card style={styles.card}>
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
            <View style={styles.countsColumn}>
              {subject.dueCount > 0 ? (
                <Text style={styles.dueText}>{subject.dueCount} tekrar gerekiyor</Text>
              ) : null}
              <Text style={styles.masteredText}>{subject.masteredCount} öğrenildi</Text>
            </View>
          </View>
        ))}
      </Card>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  card: {
    gap: 0,
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
    gap: 1,
  },
  dueText: {
    ...typography.caption,
    color: colors.danger,
  },
  masteredText: {
    ...typography.caption,
    color: colors.success,
  },
});
