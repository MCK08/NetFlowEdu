import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { memo, useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useProfileHandle } from "@features/profiles";
import { colors } from "@theme/colors";
import { duration } from "@theme/animation";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { formatRelativeTime } from "@utils/feedFormat";

import { Question } from "../types";

interface LaunchFeedCardProps {
  question: Question;
  // The card's single primary action label — role-dependent and decided by
  // the caller ("Cevapla" for a student, "Ödevde Kullan" for a teacher),
  // never guessed here. NULL renders no button at all: a caller that has no
  // real destination for this card must pass null rather than a label that
  // goes nowhere (§12's "do NOT create dead buttons").
  actionLabel: string | null;
  onPressAction: () => void;
  onPressCard: () => void;
}

// Phase 50 — the launch feed's content surface.
//
// A DELIBERATE DEPARTURE FROM FeedCard.tsx
//
// The pre-Phase-50 FeedCard is a full-bleed image with white text laid over
// a scrim, sized to exactly one viewport and paged like a short-video feed.
// That card cannot express the hierarchy this phase asks for (§12: metadata
// row, content, media, action) because every element competes with the
// photograph behind it, and it forces the hard one-item-per-screen lock
// §15 explicitly rules out. This is a separate component rather than a
// rewrite of that one so the class feed — which still uses the paged
// presentation and its own ClassFeedCard — is untouched by this phase.
//
// Height is INTRINSIC here (no `height` prop): the card sizes to its own
// content, which is what lets the next card peek into the viewport (§15)
// instead of every card being pinned to the window height.
function LaunchFeedCardComponent({
  question,
  actionLabel,
  onPressAction,
  onPressCard,
}: LaunchFeedCardProps) {
  useThemeSubscription();
  const { primaryName } = useProfileHandle(question.ownerId);

  // Phase 51 — a question whose image FAILS to load used to leave the media
  // slot as a bare 200pt block of surfaceMuted: no icon, no explanation, and
  // still tall enough to push the card's action down. Tracking the failure
  // lets it fall back to the same honest placeholder a question with no image
  // already gets, instead of a dead grey slab.
  const [hasImageFailed, setHasImageFailed] = useState(false);
  const handleImageError = useCallback(() => setHasImageFailed(true), []);

  const subject = question.subject?.trim();
  const topic = question.topic?.trim();
  const postedAt = formatRelativeTime(question.createdAt);
  const hasImage =
    typeof question.imageUrl === "string" && question.imageUrl.length > 0 && !hasImageFailed;

  return (
    <Pressable
      style={styles.card}
      onPress={onPressCard}
      accessibilityRole="button"
      accessibilityLabel={`Soruyu aç${subject ? `: ${subject}` : ""}`}
    >
      {/* TOP ROW — what this content IS, before what it looks like. */}
      <View style={styles.metaRow}>
        <View style={styles.metaChips}>
          {subject ? (
            <View style={styles.subjectChip}>
              <Text style={styles.subjectChipText} numberOfLines={1}>
                {subject}
              </Text>
            </View>
          ) : null}
          {topic ? (
            <Text style={styles.topicText} numberOfLines={1}>
              {topic}
            </Text>
          ) : null}
        </View>
        {postedAt ? <Text style={styles.timestamp}>{postedAt}</Text> : null}
      </View>

      {/* SOURCE — who posted it. Non-interactive here on purpose: the whole
          card is one tap target, and a nested profile link would silently
          change where a tap near the name goes. */}
      {primaryName ? (
        <Text style={styles.author} numberOfLines={1}>
          {primaryName}
        </Text>
      ) : null}

      {/* CONTENT — the question's own text, when it has any. */}
      {question.description ? (
        <Text style={styles.description} numberOfLines={3}>
          {question.description}
        </Text>
      ) : null}

      {/* MEDIA — fixed height so the list never reflows as images decode at
          different sizes (§46's "avoid layout jumping").

          Phase 51: the placeholder is the slot's BASE layer rather than an
          either/or branch, and the image is laid over it. A question with no
          image, one whose image is still in flight, and one whose image
          failed all now show something legible instead of an unexplained
          200pt void — previously only the "no image at all" case did, so a
          slow or broken URL left a featureless grey slab dominating the card
          (§33, §36). */}
      <View style={[styles.media, styles.mediaPlaceholder]}>
        <Ionicons name="document-text-outline" size={28} color={colors.textTertiary} />
        <Text style={styles.mediaPlaceholderText}>
          {hasImageFailed ? "Görsel yüklenemedi" : hasImage ? "Görsel yükleniyor" : "Görsel yok"}
        </Text>
        {hasImage ? (
          <Image
            source={{ uri: question.imageUrl }}
            style={styles.mediaImage}
            contentFit="cover"
            transition={duration.normal}
            onError={handleImageError}
            accessibilityLabel="Soru görseli"
          />
        ) : null}
      </View>

      {/* ACTION — one primary action, always real, omitted when the caller
          has no destination for it. */}
      {actionLabel ? (
        <Pressable
          onPress={onPressAction}
          style={styles.actionButton}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={styles.actionButtonText}>{actionLabel}</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.textInverse} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

export const LaunchFeedCard = memo(LaunchFeedCardComponent);

const styles = themedStyles(() => ({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  metaChips: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexShrink: 1,
  },
  subjectChip: {
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  subjectChipText: {
    ...typography.label,
    color: colors.primary,
    fontWeight: "700",
  },
  topicText: {
    ...typography.label,
    color: colors.textTertiary,
    flexShrink: 1,
  },
  timestamp: {
    ...typography.label,
    color: colors.textTertiary,
  },
  author: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  description: {
    ...typography.body,
    color: colors.textPrimary,
  },
  media: {
    width: "100%",
    // A FIXED height, deliberately not an aspect ratio. An aspect ratio
    // scales with the container, so the same card was ~280pt tall on a
    // phone but over 500pt in the web content column — tall enough to push
    // the card's own action button out of the first viewport (§16) and to
    // leave no room for the next card to peek in (§15). A fixed height is
    // identical on every width, and `contentFit: cover` means no image is
    // ever distorted by it.
    height: 200,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  mediaPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    overflow: "hidden",
  },
  mediaImage: {
    ...StyleSheet.absoluteFillObject,
  },
  mediaPlaceholderText: {
    ...typography.label,
    color: colors.textTertiary,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  actionButtonText: {
    ...typography.bodyStrong,
    color: colors.textInverse,
  },
}));
