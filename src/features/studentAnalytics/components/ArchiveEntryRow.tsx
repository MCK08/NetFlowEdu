import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { Card } from "@components/ui/Card";
import { StatusLabel } from "@components/ui/StatusLabel";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

import {
  ARCHIVE_STATE_ICON,
  ARCHIVE_STATE_LABEL,
  ARCHIVE_STATE_TONE,
  archiveStruggleFact,
  lastAttemptLabel,
  QUESTION_KIND_LABEL,
} from "../services/analyticsPresentation";
import type { ArchiveEntry } from "../services/studentAnalytics";
import { toneTextColor } from "./toneColor";

const THUMB_SIZE = 56;

interface ArchiveEntryRowProps {
  entry: ArchiveEntry;
  now: number;
  onPress: (questionId: string) => void;
}

/** A short line that stands in for the question on the list — never its
 *  whole body. The author's caption when there is one; otherwise what kind of
 *  question it is, which is still true and still useful. */
function previewLine(entry: ArchiveEntry): string {
  if (!entry.isQuestionAvailable) return "Bu soru artık görüntülenemiyor";
  if (entry.description) return entry.description;
  return entry.questionKind ? `${QUESTION_KIND_LABEL[entry.questionKind]} soru` : "Soru";
}

function placeLine(entry: ArchiveEntry): string {
  const parts = [entry.subject, entry.topic].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Konu bilgisi yok";
}

// Phase 107 — one archived question on the list.
export const ArchiveEntryRow = memo(function ArchiveEntryRow({ entry, now, onPress }: ArchiveEntryRowProps) {
  useThemeSubscription();
  const place = placeLine(entry);
  const preview = previewLine(entry);
  const state = ARCHIVE_STATE_LABEL[entry.state];
  const fact = archiveStruggleFact(entry);
  const when = lastAttemptLabel(entry.lastReviewedAt, now);
  const meta = when ? `${fact} · ${when}` : fact;

  return (
    <Pressable
      onPress={() => onPress(entry.questionId)}
      accessibilityRole="button"
      accessibilityLabel={`${place}. ${preview}. ${state}. ${meta}.`}
      accessibilityHint="Soruyu ve önceki denemelerinin özetini açar"
      style={styles.pressable}
    >
      <Card variant="outlined" style={styles.card}>
        <View style={styles.thumb}>
          {entry.isQuestionAvailable && entry.imageUrl ? (
            <Image
              source={{ uri: entry.imageUrl }}
              style={styles.thumbImage}
              contentFit="cover"
              accessibilityIgnoresInvertColors
              accessible={false}
            />
          ) : (
            <Ionicons
              name={entry.isQuestionAvailable ? "document-text-outline" : "eye-off-outline"}
              size={iconSize.md}
              color={colors.textTertiary}
              accessibilityElementsHidden
            />
          )}
        </View>
        <View style={styles.text}>
          <Text style={styles.place}>{place}</Text>
          <Text style={styles.preview} numberOfLines={2}>
            {preview}
          </Text>
          <StatusLabel
            icon={ARCHIVE_STATE_ICON[entry.state]}
            tone={ARCHIVE_STATE_TONE[entry.state]}
            textStyle={[styles.state, { color: toneTextColor(ARCHIVE_STATE_TONE[entry.state]) }]}
          >
            {state}
          </StatusLabel>
          <Text style={styles.meta}>{meta}</Text>
        </View>
        <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textTertiary} accessibilityElementsHidden />
      </Card>
    </Pressable>
  );
});

const styles = themedStyles(() => ({
  pressable: {
    minHeight: minTouchTarget,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: radius.md,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted,
  },
  thumbImage: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  place: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  preview: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  state: {
    ...typography.caption,
    fontWeight: "600",
  },
  meta: {
    ...typography.caption,
    color: colors.textTertiary,
  },
}));
