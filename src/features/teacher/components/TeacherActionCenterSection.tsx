import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
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
  actionCenterLabel,
  actionCenterViewAllLabel,
  actionCenterViewAllSpokenLabel,
  ACTION_CENTER_EMPTY_COPY,
  ACTION_CENTER_TITLE,
  TeacherActionCenterItem,
  TeacherActionCenterKind,
} from "../services/teacherActionCenter";

// Phase 73 — "bugün neye bakmalıyım?", at the top of a class.
//
// SCAN, NOT IMMERSION
//
// A teacher opens a class to decide something, so this is a compact list of
// rows rather than a stack of cards: label, who, why, and one action. Density
// is the point — the student surfaces are the immersive ones.
//
// NO ALARM WALL
//
// A regression is important, so it carries a warm accent and leads the list.
// It does not get a red block: every row here is about a student, and shouting
// about people is neither useful nor kind. The label and the reason carry the
// meaning; colour only reinforces them.

interface TeacherActionCenterSectionProps {
  items: readonly TeacherActionCenterItem[];
  onOpenStudent: (studentUid: string) => void;
  onPrepareIntervention: (item: TeacherActionCenterItem) => void;
  /** Phase 101 — passed only when the embedded summary hides actions
   *  (summarizeTeacherActionCenter's hasMore). Absent means nothing is hidden,
   *  so no control is shown. */
  viewAll?: { totalCount: number; onPress: () => void } | null;
  /** Phase 101 — the full route names the screen in its own header, so it
   *  hides this one rather than repeat the same title twice. */
  showHeader?: boolean;
}

const KIND_ICON: Readonly<Record<TeacherActionCenterKind, keyof typeof Ionicons.glyphMap>> = {
  escalate: "alert-circle-outline",
  follow_up: "repeat-outline",
  prepare_intervention: "create-outline",
  review_student: "eye-outline",
};

function accentFor(kind: TeacherActionCenterKind): string {
  switch (kind) {
    case "escalate":
      return colors.danger;
    case "follow_up":
      return colors.primary;
    case "prepare_intervention":
      return colors.brandNavy;
    case "review_student":
    default:
      return colors.textSecondary;
  }
}

/** The button a row offers. Only ever an action the app can actually perform:
 *  a topic row opens the intervention composer, a student row opens that
 *  student. Nothing here creates an assignment on its own. */
function ctaLabelFor(kind: TeacherActionCenterKind): string {
  return kind === "prepare_intervention" ? "Müdahale Hazırla" : "Öğrenciyi Gör";
}

const ActionRow = memo(function ActionRow({
  item,
  onOpenStudent,
  onPrepareIntervention,
}: {
  item: TeacherActionCenterItem;
  onOpenStudent: (studentUid: string) => void;
  onPrepareIntervention: (item: TeacherActionCenterItem) => void;
}) {
  useThemeSubscription();

  const accent = accentFor(item.kind);
  const label = actionCenterLabel(item);
  const cta = ctaLabelFor(item.kind);
  const topicLine = item.topicContext
    ? `${item.topicContext.subject} · ${item.topicContext.topic}`
    : null;
  const showTopic = topicLine !== null && topicLine !== item.title;

  const handlePress = () => {
    if (item.kind === "prepare_intervention") {
      onPrepareIntervention(item);
      return;
    }
    if (item.studentUid) onOpenStudent(item.studentUid);
  };

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={joinSpokenLabel([label, item.title, item.reason, item.evidenceNote, cta])}
      style={styles.row}
    >
      <View style={[styles.marker, { backgroundColor: accent }]} />
      <View style={styles.body}>
        <View style={styles.labelRow}>
          {/* Phase 104 (H3) — decorative: the row's own label already joins
              kind + title + reason + evidence + CTA into one sentence. */}
          <Ionicons
            name={KIND_ICON[item.kind]}
            size={iconSize.xs}
            color={accent}
            accessibilityElementsHidden
          />
          <Text style={[styles.kindLabel, { color: accent }]}>{label}</Text>
        </View>
        {/* Two lines: on a topic action the title IS the topic, so clipping
            it at 375px would lose the one thing the row is about. */}
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        {/* Only when it adds something: a topic action's title IS its topic,
            so repeating it underneath would be the same words twice. */}
        {showTopic ? (
          <Text style={styles.topic} numberOfLines={1}>
            {topicLine}
          </Text>
        ) : null}
        <Text style={styles.reason}>{item.reason}</Text>
        {item.evidenceNote ? <Text style={styles.evidence}>{item.evidenceNote}</Text> : null}
        {/* The action closes the row rather than sitting in its own column:
            as a sibling column it took a fixed share of the width, which at
            150% text left the reason wrapping one word per line. */}
        <View style={styles.ctaWrap}>
          <Text style={styles.cta}>{cta}</Text>
          {/* Phase 104 (H3) — decorative. The CTA text is already the last
              clause of the row's composed label; announcing the chevron too
              would read "… Öğrenciyi Gör, chevron forward". */}
          <Ionicons
            name="chevron-forward"
            size={iconSize.xs}
            color={colors.textTertiary}
            accessibilityElementsHidden
          />
        </View>
      </View>
    </Pressable>
  );
});

export const TeacherActionCenterSection = memo(function TeacherActionCenterSection({
  items,
  onOpenStudent,
  onPrepareIntervention,
  viewAll = null,
  showHeader = true,
}: TeacherActionCenterSectionProps) {
  useThemeSubscription();

  return (
    <View style={styles.section}>
      {showHeader ? <SectionHeader title={ACTION_CENTER_TITLE} /> : null}
      {items.length === 0 ? (
        // Deliberately not "the class is fine": students with no trustworthy
        // evidence are invisible to every signal behind this list.
        <Text style={styles.empty}>{ACTION_CENTER_EMPTY_COPY}</Text>
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <ActionRow
              key={item.id}
              item={item}
              onOpenStudent={onOpenStudent}
              onPrepareIntervention={onPrepareIntervention}
            />
          ))}
        </View>
      )}
      {/* Phase 101 — after the rows, not in the header: a teacher reaches it
          having just scanned the five actions it continues, and as its own
          row it gets a full touch target instead of a caption-sized link. */}
      {viewAll ? (
        <Pressable
          onPress={viewAll.onPress}
          accessibilityRole="button"
          accessibilityLabel={actionCenterViewAllSpokenLabel(viewAll.totalCount)}
          style={styles.viewAll}
        >
          <Text style={styles.viewAllLabel}>{actionCenterViewAllLabel(viewAll.totalCount)}</Text>
          {/* Phase 104 (H3) — decorative; the pressable already announces
              the spoken "view all" sentence with its count. */}
          <Ionicons
            name="chevron-forward"
            size={iconSize.xs}
            color={colors.primary}
            accessibilityElementsHidden
          />
        </Pressable>
      ) : null}
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
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    minHeight: minTouchTarget,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: spacing.sm,
  },
  marker: {
    width: 3,
    alignSelf: "stretch",
    borderRadius: radius.pill,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  kindLabel: {
    ...typography.caption,
    flexShrink: 1,
  },
  title: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  topic: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  reason: {
    ...typography.body,
    color: colors.textSecondary,
  },
  evidence: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  ctaWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.xxs,
    marginTop: spacing.xxs,
  },
  cta: {
    ...typography.caption,
    color: colors.primary,
  },
  empty: {
    ...typography.body,
    color: colors.textSecondary,
  },
  viewAll: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    minHeight: minTouchTarget,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  viewAllLabel: {
    ...typography.bodyStrong,
    color: colors.primary,
    flexShrink: 1,
    textAlign: "center",
  },
}));
