import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { memo } from "react";
import { Text, View } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { Badge } from "@components/ui/Badge";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { roleLabel } from "@utils/roleLabels";
import { Question } from "@/types/question";

interface ClassQuestionTileProps {
  question: Question;
  width: number;
}

// Phase 106 — one question in the student's class grid.
//
// Replaces the profile's square QuestionGridItem on this screen: that tile
// is a bare image with a role chip pinned over it, which on a class page
// full of teacher-posted questions read as rows of empty rectangles all
// stamped "Öğretmen". This one shows what the document actually carries —
// the image, the poster's role as a quiet badge, the subject and topic when
// set, and the real like/comment counts — and nothing it does not. A
// question with no subject or topic simply shows no line for it.
//
// Same destination as before (the question detail), and the whole tile is
// the button: one accessible node that speaks the role, the topic and the
// counts, so the decorative marks inside are hidden from the tree.
export const ClassQuestionTile = memo(function ClassQuestionTile({ question, width }: ClassQuestionTileProps) {
  // Phase 49 — memo() blocks prop-driven re-renders, but NOT context
  // updates; without this subscription this component would keep its
  // previous theme's styles after a live theme switch.
  useThemeSubscription();

  const topicLine = [question.subject, question.topic].filter((part) => part.length > 0).join(" · ");
  const posterLabel = roleLabel(question.posterRole);
  const spoken = [
    `${posterLabel} sorusu`,
    topicLine || null,
    `${question.likeCount} beğeni`,
    `${question.commentCount} yorum`,
  ]
    .filter((part): part is string => part !== null)
    .join(". ");

  return (
    <AnimatedPressable
      style={[styles.tile, { width }]}
      onPress={() =>
        router.push({ pathname: "/(student)/question/[questionId]", params: { questionId: question.id } })
      }
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint="Soru detayını açar"
    >
      <View style={styles.media}>
        <Image source={{ uri: question.imageUrl }} style={styles.image} contentFit="cover" transition={150} />
        <View style={styles.roleBadge}>
          <Badge label={posterLabel} variant={question.posterRole === "teacher" ? "primary" : "neutral"} />
        </View>
      </View>

      <View style={styles.meta}>
        {topicLine ? (
          <Text style={styles.topic} numberOfLines={2}>
            {topicLine}
          </Text>
        ) : (
          <Text style={styles.topicMuted} numberOfLines={1}>
            Soru
          </Text>
        )}
        <View style={styles.counts}>
          <View style={styles.count}>
            <Ionicons name="heart-outline" size={iconSize.xs} color={colors.textTertiary} accessibilityElementsHidden />
            <Text style={styles.countText}>{question.likeCount}</Text>
          </View>
          <View style={styles.count}>
            <Ionicons name="chatbubble-outline" size={iconSize.xs} color={colors.textTertiary} accessibilityElementsHidden />
            <Text style={styles.countText}>{question.commentCount}</Text>
          </View>
        </View>
      </View>
    </AnimatedPressable>
  );
});

const styles = themedStyles(() => ({
  tile: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.divider,
    overflow: "hidden",
  },
  media: {
    // Portrait, like the photos students actually take of a question on a
    // page; a square cropped too much of the working.
    aspectRatio: 4 / 5,
    backgroundColor: colors.surfaceMuted,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  roleBadge: {
    position: "absolute",
    left: spacing.xs,
    top: spacing.xs,
  },
  meta: {
    padding: spacing.sm,
    gap: spacing.xxs,
  },
  topic: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  topicMuted: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  counts: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  count: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  countText: {
    ...typography.caption,
    color: colors.textTertiary,
  },
}));
