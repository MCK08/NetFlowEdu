import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";
import { formatRelativeTime } from "@utils/feedFormat";
import { joinSpokenLabel } from "@utils/spokenLabel";
import { Question } from "@/types/question";

import {
  isTimelineMilestone,
  SemanticDefinitionTimeline,
  SemanticTimelineEntry,
  SemanticTimelineEntryKind,
  timelineAbsenceCopy,
  timelineEntryLabel,
  timelineEntryText,
  TIMELINE_OPEN_LABEL,
  TIMELINE_SECTION_TITLE,
  TIMELINE_WINDOW_NOTE,
  visibleTimelineEntries,
} from "../services/semanticDefinitionTimeline";

// Phase 84 — the chronology beneath Phase 83's evidence summary.
//
// WHY A THREAD AND NOT A CHART
//
// Every shape a chart offers implies a quantity moving in a direction, and
// there is no such quantity here. A line would claim a trend, an area would
// claim volume, a sparkline would claim momentum — all three would say
// "improving" or "worsening" without a single record supporting it. What the
// evidence actually is, is a short list of dated moments, so that is what this
// draws: one rail, nodes on it, in order.
//
// It also extends the motif directly above it rather than inventing a second
// one. The evidence summary is already a thread; the history is the same
// thread, continued backwards in time.
//
// NODE LANGUAGE
//
// Shape carries the meaning and text repeats it, so nothing depends on colour:
// a selection is solid, a passed-over opportunity is an open ring, a threshold
// is a filled marker with its own icon, and a recovery node is dashed. Every
// node also states its kind in words.

export interface TimelineSectionProps {
  timeline: SemanticDefinitionTimeline;
  /** Collapsed by default — the Phase 83 detail above it is already dense. */
  defaultOpen?: boolean;
  /** Class questions the route already loaded, for inline context. Never a
   *  lookup that costs a read, and never rendered as an id. */
  questionsById: ReadonlyMap<string, Question>;
  onOpenStudent: (studentUid: string) => void;
  now?: number;
}

const NODE_SIZE = 22;
const RAIL_INSET = NODE_SIZE / 2;

const NODE_ICON: Readonly<Record<SemanticTimelineEntryKind, keyof typeof Ionicons.glyphMap>> = {
  selection: "ellipse",
  declined_opportunity: "ellipse-outline",
  repeated_pattern_reached: "repeat",
  recovery_signal_reached: "trending-up-outline",
  recovery_signal_withdrawn: "arrow-undo-outline",
};

const TimelineNode = memo(function TimelineNode({
  entry,
  questionText,
  onOpenStudent,
  now,
}: {
  entry: SemanticTimelineEntry;
  questionText: string | null;
  onOpenStudent: (studentUid: string) => void;
  now: number;
}) {
  useThemeSubscription();
  const open = useCallback(() => onOpenStudent(entry.studentUid), [entry.studentUid, onOpenStudent]);

  const milestone = isTimelineMilestone(entry);
  const when = formatRelativeTime(entry.occurredAt, now);
  const kindLabel = timelineEntryLabel(entry);
  const text = timelineEntryText(entry);

  return (
    <Pressable
      onPress={open}
      style={styles.row}
      accessibilityRole="button"
      // Chronological reading order: who, what, when, and the question if one
      // is safely available. The student's own screen is the drilldown.
      accessibilityLabel={joinSpokenLabel([entry.displayName, kindLabel, when, text, questionText])}
      accessibilityHint="Öğrencinin performans ekranını açar"
    >
      <View
        style={[
          styles.node,
          milestone ? styles.nodeMilestone : null,
          entry.kind === "declined_opportunity" ? styles.nodeOutlined : null,
          entry.kind === "recovery_signal_reached" || entry.kind === "recovery_signal_withdrawn"
            ? styles.nodeDashed
            : null,
        ]}
      >
        <Ionicons
          name={NODE_ICON[entry.kind]}
          size={iconSize.xs}
          color={milestone ? colors.textInverse : colors.primary}
        />
      </View>

      <View style={styles.body}>
        <View style={styles.headRow}>
          <Text style={styles.name} numberOfLines={1}>
            {entry.displayName}
          </Text>
          <Text style={styles.when}>{when}</Text>
        </View>
        <Text style={[styles.kind, milestone ? styles.kindMilestone : null]} numberOfLines={2}>
          {kindLabel}
        </Text>
        <Text style={styles.text} numberOfLines={3}>
          {text}
        </Text>
        {questionText ? (
          <Text style={styles.question} numberOfLines={2}>
            {questionText}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
});

export const SemanticDefinitionTimelineSection = memo(function SemanticDefinitionTimelineSection({
  timeline,
  defaultOpen = false,
  questionsById,
  onOpenStudent,
  now = Date.now(),
}: TimelineSectionProps) {
  useThemeSubscription();
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [showAll, setShowAll] = useState(false);

  // A different definition is a different page — fold it again.
  useEffect(() => {
    setIsOpen(defaultOpen);
    setShowAll(false);
  }, [defaultOpen, timeline]);

  const toggleOpen = useCallback(() => setIsOpen((current) => !current), []);
  const toggleAll = useCallback(() => setShowAll((current) => !current), []);

  const visible = useMemo(
    () => visibleTimelineEntries(timeline, showAll),
    [timeline, showAll],
  );
  const hidden = timeline.entries.length - visible.length;

  if (timeline.isEmpty) {
    const copy = timelineAbsenceCopy();
    return (
      <View style={styles.section}>
        <Text style={styles.title} accessibilityRole="header">
          {TIMELINE_SECTION_TITLE}
        </Text>
        <Text style={styles.emptyTitle}>{copy.title}</Text>
        <Text style={styles.windowNote}>{copy.description}</Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Pressable
        onPress={toggleOpen}
        style={styles.header}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        // react-native-web drops accessibilityState.expanded on a Pressable, so
        // the state is carried in the words too (verified in the DOM, Phase 76).
        aria-expanded={isOpen}
        accessibilityLabel={joinSpokenLabel([
          TIMELINE_OPEN_LABEL,
          `${timeline.entries.length} kayıt`,
          isOpen ? "Genişletildi" : "Genişletmek için seçin",
        ])}
      >
        <Ionicons name="time-outline" size={iconSize.sm} color={colors.primary} />
        <Text style={styles.headerLabel}>{TIMELINE_OPEN_LABEL}</Text>
        <Text style={styles.headerCount}>{`${timeline.entries.length}`}</Text>
        <Ionicons
          name={isOpen ? "chevron-up" : "chevron-down"}
          size={iconSize.sm}
          color={colors.textTertiary}
        />
      </Pressable>

      {isOpen ? (
        <View style={styles.thread}>
          {/* Said before any node, so nothing below reads as lifetime. */}
          <Text style={styles.windowNote}>{TIMELINE_WINDOW_NOTE}</Text>

          <View style={styles.nodes}>
            {/* The rail. Decorative: every fact is in the rows beside it. */}
            <View style={styles.rail} importantForAccessibility="no-hide-descendants" />
            {visible.map((entry) => (
              <TimelineNode
                key={entry.id}
                entry={entry}
                questionText={
                  entry.questionId
                    ? (questionsById.get(entry.questionId)?.description?.trim() ?? null)
                    : null
                }
                onOpenStudent={onOpenStudent}
                now={now}
              />
            ))}
          </View>

          {hidden > 0 || showAll ? (
            <Pressable
              onPress={toggleAll}
              style={styles.showAll}
              accessibilityRole="button"
              accessibilityState={{ expanded: showAll }}
              accessibilityLabel={
                showAll
                  ? "Daha az kayıt göster"
                  : `${hidden} kayıt daha, tüm kanıt geçmişini göster`
              }
            >
              <Text style={styles.showAllLabel}>
                {showAll ? "Daha az göster" : `Tüm kanıt geçmişini göster (${hidden} daha)`}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

const styles = themedStyles(() => ({
  section: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    gap: spacing.xxs,
  },
  title: {
    ...typography.label,
    color: colors.textTertiary,
    // Deliberately NOT text-transform: uppercase. CSS case folding is
    // locale-unaware here and turns "Kanıt geçmişi" into "KANIT GEÇMIŞI",
    // losing both dotted capitals. The heading reads correctly as written.
  },
  emptyTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  windowNote: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  header: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: spacing.xs,
    minHeight: minTouchTarget,
  },
  headerLabel: {
    ...typography.bodyStrong,
    color: colors.primary,
    flex: 1,
  },
  headerCount: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  thread: {
    gap: spacing.xs,
  },
  nodes: {
    position: "relative" as const,
    gap: spacing.sm,
  },
  rail: {
    position: "absolute" as const,
    left: RAIL_INSET,
    top: RAIL_INSET,
    bottom: RAIL_INSET,
    width: 1,
    backgroundColor: colors.border,
  },
  row: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: spacing.sm,
    minHeight: minTouchTarget,
  },
  node: {
    width: NODE_SIZE,
    height: NODE_SIZE,
    borderRadius: radius.pill,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  // A passed-over opportunity: an open ring, legible in greyscale.
  nodeOutlined: {
    backgroundColor: colors.background,
  },
  // A canonical threshold: filled, so it reads as a marker on the rail.
  nodeMilestone: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  // Recovery: the ring opens up, the same shape language the cohort markers
  // already use for a recovering student.
  nodeDashed: {
    backgroundColor: colors.surfaceMuted,
    borderStyle: "dashed" as const,
    borderColor: colors.textTertiary,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  headRow: {
    flexDirection: "row" as const,
    alignItems: "baseline" as const,
    gap: spacing.xs,
  },
  name: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  when: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  kind: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  kindMilestone: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: "700" as const,
  },
  text: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  question: {
    ...typography.caption,
    color: colors.textTertiary,
    fontStyle: "italic" as const,
  },
  showAll: {
    minHeight: minTouchTarget,
    justifyContent: "center" as const,
  },
  showAllLabel: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "600" as const,
  },
}));
