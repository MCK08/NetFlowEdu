import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";

import { PrimaryButton } from "@components/ui/PrimaryButton";
import { SectionHeader } from "@components/ui/SectionHeader";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget, stackAtFontScale } from "@theme/sizes";
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
  TeacherActionCenterItem,
  TeacherActionCenterKind,
} from "../services/teacherActionCenter";

export const TODAY_PRIORITY_TITLE = "Bugünün Önceliği";
export const TODAY_PENDING_TITLE = "Bekleyen Aksiyonlar";

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
 *  a topic action opens the intervention composer, a student action opens that
 *  student. Nothing here creates work on its own. */
function ctaLabelFor(kind: TeacherActionCenterKind): string {
  return kind === "prepare_intervention" ? "Müdahale Hazırla" : "Öğrenciyi Gör";
}

interface TeacherTodayActionsProps {
  /** The canonical list, in the order the Action Center built it. The first
   *  item leads because that list's precedence already says so — nothing here
   *  sorts, scores or re-ranks. */
  items: readonly TeacherActionCenterItem[];
  onOpenStudent: (studentUid: string) => void;
  onPrepareIntervention: (item: TeacherActionCenterItem) => void;
  viewAll?: { totalCount: number; onPress: () => void } | null;
}

// Phase 119 — the day's work, with one thing at the front of it.
//
// The five canonical actions used to be five identical rows, so "what should
// I do first?" was answered only by reading position. The list's precedence
// (Phase 47 escalations, then follow-ups, then hotspots, then students)
// already contains that answer, so the first item is simply DRAWN as the
// answer: one card with room for its reason, its evidence and a real button.
// The rest keep their compact rows beneath it.
//
// This adds no priority of its own. Take the same list in the same order and
// the same item leads; there is no score, no weighting and no second model.

function handlerFor(
  item: TeacherActionCenterItem,
  onOpenStudent: (studentUid: string) => void,
  onPrepareIntervention: (item: TeacherActionCenterItem) => void,
): () => void {
  return () => {
    if (item.kind === "prepare_intervention") {
      onPrepareIntervention(item);
      return;
    }
    if (item.studentUid) onOpenStudent(item.studentUid);
  };
}

const PriorityCard = memo(function PriorityCard({
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
  const topicLine = item.topicContext ? `${item.topicContext.subject} · ${item.topicContext.topic}` : null;
  const showTopic = topicLine !== null && topicLine !== item.title;

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        {/* Phase 73's rule, kept: "it does not get a red block — every row
            here is about a student, and shouting about people is neither
            useful nor kind". A filled accent made an escalation a solid red
            square in light mode (and, because danger and textInverse both
            flip, a pale one in dark — the same badge reading two different
            ways). The mark is a quiet tile in both themes and the accent
            stays on the glyph and the word beside it. */}
        <View style={styles.mark}>
          {/* Decorative: the label beside it is the same word in text. */}
          <Ionicons
            name={KIND_ICON[item.kind]}
            size={iconSize.md}
            color={accent}
            accessibilityElementsHidden
          />
        </View>
        <Text style={[styles.kindLabel, { color: accent }]}>{label}</Text>
      </View>

      <Text style={styles.cardTitle}>{item.title}</Text>
      {showTopic ? <Text style={styles.cardTopic}>{topicLine}</Text> : null}
      <Text style={styles.cardReason}>{item.reason}</Text>
      {item.evidenceNote ? <Text style={styles.cardEvidence}>{item.evidenceNote}</Text> : null}

      <PrimaryButton
        label={cta}
        onPress={handlerFor(item, onOpenStudent, onPrepareIntervention)}
        accessibilityHint={
          item.kind === "prepare_intervention"
            ? "Bu konu için müdahale hazırlamayı açar"
            : "Öğrencinin performans sayfasını açar"
        }
      />
    </View>
  );
});

const PendingRow = memo(function PendingRow({
  item,
  onOpenStudent,
  onPrepareIntervention,
}: {
  item: TeacherActionCenterItem;
  onOpenStudent: (studentUid: string) => void;
  onPrepareIntervention: (item: TeacherActionCenterItem) => void;
}) {
  useThemeSubscription();
  const { fontScale } = useWindowDimensions();
  const accent = accentFor(item.kind);
  const label = actionCenterLabel(item);
  const cta = ctaLabelFor(item.kind);
  const topicLine = item.topicContext ? `${item.topicContext.subject} · ${item.topicContext.topic}` : null;
  const detail = topicLine && topicLine !== item.title ? `${label} · ${topicLine}` : label;
  // Centred against a one- or two-line row the mark and the chevron read as
  // its ends. Once the text wraps to four or five lines they float against
  // the middle of it, and the chevron lands mid-sentence — so past the
  // accessibility sizes both align with the row's first line instead.
  const stacked = fontScale >= stackAtFontScale;

  return (
    <Pressable
      onPress={handlerFor(item, onOpenStudent, onPrepareIntervention)}
      accessibilityRole="button"
      accessibilityLabel={joinSpokenLabel([label, item.title, item.reason, cta])}
      style={[styles.row, stacked ? styles.rowTopAligned : null]}
    >
      <View style={[styles.dot, stacked ? styles.dotTopAligned : null, { backgroundColor: accent }]} />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{item.title}</Text>
        <Text style={styles.rowDetail}>{detail}</Text>
      </View>
      {/* Decorative: the row's own label already ends with what it opens. */}
      <Ionicons
        name="chevron-forward"
        size={iconSize.sm}
        color={colors.textTertiary}
        accessibilityElementsHidden
      />
    </Pressable>
  );
});

export const TeacherTodayActions = memo(function TeacherTodayActions({
  items,
  onOpenStudent,
  onPrepareIntervention,
  viewAll = null,
}: TeacherTodayActionsProps) {
  useThemeSubscription();

  const priority = items[0];
  const pending = items.slice(1);

  if (!priority) {
    return (
      <View style={styles.block}>
        <SectionHeader title={TODAY_PRIORITY_TITLE} />
        {/* Deliberately not "the class is fine": students with no trustworthy
            evidence are invisible to every signal behind this list. */}
        <Text style={styles.empty}>{ACTION_CENTER_EMPTY_COPY}</Text>
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      <View style={styles.block}>
        <SectionHeader title={TODAY_PRIORITY_TITLE} />
        <PriorityCard
          item={priority}
          onOpenStudent={onOpenStudent}
          onPrepareIntervention={onPrepareIntervention}
        />
      </View>

      {pending.length > 0 ? (
        <View style={styles.block}>
          <SectionHeader
            title={TODAY_PENDING_TITLE}
            action={
              viewAll
                ? { label: actionCenterViewAllLabel(viewAll.totalCount), onPress: viewAll.onPress }
                : undefined
            }
          />
          <View style={styles.list}>
            {pending.map((item) => (
              <PendingRow
                key={item.id}
                item={item}
                onOpenStudent={onOpenStudent}
                onPrepareIntervention={onPrepareIntervention}
              />
            ))}
          </View>
        </View>
      ) : viewAll ? (
        <Pressable
          onPress={viewAll.onPress}
          accessibilityRole="button"
          accessibilityLabel={actionCenterViewAllSpokenLabel(viewAll.totalCount)}
          style={styles.viewAll}
        >
          <Text style={styles.viewAllLabel}>{actionCenterViewAllLabel(viewAll.totalCount)}</Text>
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = themedStyles(() => ({
  stack: {
    gap: spacing.lg,
  },
  block: {
    gap: spacing.xs,
  },
  card: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  mark: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted,
  },
  kindLabel: {
    ...typography.caption,
    fontWeight: "600",
    flexShrink: 1,
  },
  cardTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  cardTopic: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  cardReason: {
    ...typography.body,
    color: colors.textSecondary,
  },
  cardEvidence: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  list: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
  },
  rowTopAligned: {
    alignItems: "flex-start",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
  },
  // Roughly the optical centre of a first line of body text.
  dotTopAligned: {
    marginTop: spacing.xs,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  rowDetail: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  empty: {
    ...typography.body,
    color: colors.textSecondary,
  },
  viewAll: {
    minHeight: minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
  },
  viewAllLabel: {
    ...typography.bodyStrong,
    color: colors.primary,
    textAlign: "center",
  },
}));
