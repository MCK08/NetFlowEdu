import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { SectionHeader } from "@components/ui/SectionHeader";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";
import { joinSpokenLabel } from "@utils/spokenLabel";

import {
  ClassConceptCell,
  ClassConceptHeatmap,
  ClassConceptPresentation,
  conceptCellFacts,
  conceptCellLabel,
  standingLabel,
  StudentTopicStanding,
} from "../services/classConceptHeatmap";

// Phase 73 — where the class's learning signals concentrate, by topic.
//
// NOT A TRAFFIC-LIGHT GRID
//
// "Heatmap" describes the information, not the visual. A red/amber/green matrix
// would turn topics into judgements and force a teacher to decode colour; this
// is a row per topic with a state in words, the counts behind it, and the
// students on tap. It also survives 375px, which a spreadsheet does not.
//
// The counts are people, never shares. Nothing here renders a percentage.

interface ClassConceptHeatmapSectionProps {
  heatmap: ClassConceptHeatmap;
  onOpenStudent: (studentUid: string) => void;
}

const PRESENTATION_ICON: Readonly<
  Record<ClassConceptPresentation, keyof typeof Ionicons.glyphMap>
> = {
  needs_attention: "repeat-outline",
  recovering: "trending-up-outline",
  steady: "checkmark-circle-outline",
  insufficient: "ellipse-outline",
};

function accentFor(presentation: ClassConceptPresentation): string {
  switch (presentation) {
    case "needs_attention":
      return colors.danger;
    case "recovering":
      return colors.primary;
    case "steady":
      return colors.success;
    case "insufficient":
    default:
      // Neutral, deliberately not faded away: "we do not know yet" is a real
      // finding a teacher should act on, not noise.
      return colors.textTertiary;
  }
}

function standingAccent(standing: StudentTopicStanding): string {
  switch (standing) {
    case "persistent_struggle":
      return colors.danger;
    case "recovering":
      return colors.primary;
    case "steady":
      return colors.success;
    default:
      return colors.textTertiary;
  }
}

const ConceptRow = memo(function ConceptRow({
  cell,
  onOpenStudent,
}: {
  cell: ClassConceptCell;
  onOpenStudent: (studentUid: string) => void;
}) {
  useThemeSubscription();
  const [isOpen, setIsOpen] = useState(false);

  const toggle = useCallback(() => setIsOpen((current) => !current), []);

  const accent = accentFor(cell.presentation);
  const label = conceptCellLabel(cell);
  const facts = conceptCellFacts(cell);

  return (
    <View style={styles.row}>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        accessibilityLabel={joinSpokenLabel([
          `${cell.subject}, ${cell.topic}`,
          label,
          facts.join(", "),
        ])}
        style={styles.header}
      >
        <View style={styles.headerBody}>
          <Text style={styles.subject}>{cell.subject}</Text>
          <Text style={styles.topic}>{cell.topic}</Text>
          <View style={styles.stateRow}>
            <Ionicons
              name={PRESENTATION_ICON[cell.presentation]}
              size={iconSize.xs}
              color={accent}
            />
            <Text style={[styles.stateLabel, { color: accent }]}>{label}</Text>
          </View>
          <View style={styles.facts}>
            {facts.map((fact) => (
              <View key={fact} style={styles.factChip}>
                <Text style={styles.factText}>{fact}</Text>
              </View>
            ))}
          </View>
        </View>
        <Ionicons
          name={isOpen ? "chevron-up" : "chevron-down"}
          size={iconSize.sm}
          color={colors.textTertiary}
        />
      </Pressable>

      {/* Detail on demand — the scan surface stays scannable. */}
      {isOpen ? (
        <View style={styles.students}>
          {cell.students.map((student) => (
            <Pressable
              key={student.studentUid}
              onPress={() => onOpenStudent(student.studentUid)}
              accessibilityRole="button"
              accessibilityLabel={`${student.displayName}. ${standingLabel(student.standing)}`}
              style={styles.studentRow}
            >
              <View
                style={[styles.studentDot, { backgroundColor: standingAccent(student.standing) }]}
              />
              <Text style={styles.studentName} numberOfLines={1}>
                {student.displayName}
              </Text>
              <Text style={styles.studentStanding} numberOfLines={1}>
                {standingLabel(student.standing)}
              </Text>
              <Ionicons name="chevron-forward" size={iconSize.xs} color={colors.textTertiary} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
});

export const ClassConceptHeatmapSection = memo(function ClassConceptHeatmapSection({
  heatmap,
  onOpenStudent,
}: ClassConceptHeatmapSectionProps) {
  useThemeSubscription();

  return (
    <View style={styles.section}>
      <SectionHeader title="Sınıf Konu Haritası" />
      {heatmap.isEmpty ? (
        <Text style={styles.empty}>
          Sınıfın konularında henüz yeterli öğrenme kanıtı yok.
        </Text>
      ) : (
        <View style={styles.list}>
          {heatmap.cells.map((cell) => (
            <ConceptRow key={cell.id} cell={cell} onOpenStudent={onOpenStudent} />
          ))}
        </View>
      )}
    </View>
  );
});

const styles = themedStyles(() => ({
  section: {
    gap: spacing.xs,
  },
  list: {
    gap: spacing.xs,
  },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.divider,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: minTouchTarget,
    padding: spacing.sm,
  },
  headerBody: {
    flex: 1,
    gap: 2,
  },
  subject: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  topic: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  stateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    marginTop: spacing.xxs,
  },
  stateLabel: {
    ...typography.caption,
    flexShrink: 1,
  },
  facts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xxs,
    marginTop: spacing.xxs,
  },
  factChip: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  factText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  students: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingVertical: spacing.xxs,
  },
  studentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.sm,
  },
  studentDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  studentName: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    flex: 1,
  },
  studentStanding: {
    ...typography.caption,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  empty: {
    ...typography.body,
    color: colors.textSecondary,
  },
}));
