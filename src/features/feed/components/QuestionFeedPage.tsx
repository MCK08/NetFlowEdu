import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { memo, useCallback } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { StatusLabel } from "@components/ui/StatusLabel";
import { useAuth } from "@features/authentication";
import { useCommunitySignal } from "@features/communityDifficulty";
import { useProfileHandle } from "@features/profiles";
import { useSavedQuestion } from "@features/questions";
import { MultipleChoiceAnswer } from "@features/questions/components/MultipleChoiceAnswer";
import { QuestionHintLadder } from "@features/questions/components/QuestionHintLadder";
import { hasMultipleChoice } from "@features/questions/services/multipleChoice";
import { useLike } from "@features/social/likes";
import type { StudyOutcome } from "@features/study/domain/studyTypes";
import { useNavigationGuard } from "@hooks/useNavigationGuard";
import { colors } from "@theme/colors";
import { duration } from "@theme/animation";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";
import { formatCount } from "@utils/feedFormat";
import { roleLabel } from "@utils/roleLabels";

import { Question } from "../types";

interface QuestionFeedPageProps {
  question: Question;
  /** Exactly the pager's page height; the page never grows past it. */
  height: number;
  isStudent: boolean;
  /** An outcome the inline answer engine recorded for this question. */
  onOutcomeRecorded: (outcome: StudyOutcome, question: Question) => void;
  onPressImage: (uri: string) => void;
  /** The accessible "next question" action; swiping is never the only way. */
  onNext: () => void;
  /** Shown only when a next page exists. */
  hasNext: boolean;
}

/** The media area's share of the page: enough for a photographed question
 *  to be read, while the choices stay in reach without scrolling on a
 *  phone. The rest of the page scrolls inside itself when the content is
 *  taller (long captions, five choices, an opened hint ladder). */
const MEDIA_SHARE = 0.4;

export const COMMUNITY_FEED_SENTENCE = "Bu soru toplulukta da zorlayıcı.";

// Phase 109 — one question, one page. The question is the hero: its image,
// its words, its choices, then the support (hint) and the actions. Answering
// happens HERE through the same MultipleChoiceAnswer QuestionDetailScreen
// renders (one engine, one bridge to recordStudyOutcome), and the open-ended
// path is the same AnswerScreen. This page draws nothing about the answer
// itself; it only hosts the canonical components.
function QuestionFeedPageComponent({
  question,
  height,
  isStudent,
  onOutcomeRecorded,
  onPressImage,
  onNext,
  hasNext,
}: QuestionFeedPageProps) {
  useThemeSubscription();
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid;
  const author = useProfileHandle(question.ownerId);
  const { liked, likeCount, toggle: toggleLike } = useLike({
    targetType: "question",
    targetId: question.id,
    initialLikeCount: question.likeCount,
    uid,
  });
  const { saved, toggle: toggleSaved } = useSavedQuestion(question, uid);
  // Phase 108's signal, read for the visible page only (the pager keeps a
  // window of three pages mounted) and shown as one quiet line, never a
  // percentage, never a name.
  const community = useCommunitySignal(isStudent ? question.id : undefined);
  const guardedNavigate = useNavigationGuard();

  const choices = hasMultipleChoice(question.choices) ? question.choices : null;
  const isMultipleChoice = choices !== null;
  const subject = question.subject.trim();
  const topic = question.topic.trim();
  const caption = question.description?.trim() ?? "";

  const openDetail = useCallback(() => {
    guardedNavigate(`detail-${question.id}`, () =>
      router.push({ pathname: "/(student)/question/[questionId]", params: { questionId: question.id } }),
    );
  }, [guardedNavigate, question.id]);

  const openAnswer = useCallback(() => {
    guardedNavigate(`answer-${question.id}`, () =>
      router.push({
        pathname: "/(student)/answer/[questionId]",
        params: { questionId: question.id, visibility: question.visibility },
      }),
    );
  }, [guardedNavigate, question.id, question.visibility]);

  const openAuthor = useCallback(() => {
    if (!question.ownerId) return;
    router.push({ pathname: "/(student)/user/[userId]", params: { userId: question.ownerId } });
  }, [question.ownerId]);

  return (
    <View style={[styles.page, { height }]}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        <View style={styles.metaRow}>
          <View style={styles.tags}>
            {subject ? (
              <View style={styles.tag}>
                <Text style={styles.tagText}>{subject}</Text>
              </View>
            ) : null}
            {topic ? (
              <View style={[styles.tag, styles.tagQuiet]}>
                <Text style={styles.tagQuietText}>{topic}</Text>
              </View>
            ) : null}
          </View>
          <Pressable
            onPress={openAuthor}
            style={styles.author}
            accessibilityRole="button"
            accessibilityLabel={`${author.primaryName}, ${roleLabel(question.posterRole)}. Profili aç`}
            hitSlop={8}
          >
            <Text style={styles.authorText} numberOfLines={1}>
              {author.primaryName}
            </Text>
            <Text style={styles.authorRole}>{roleLabel(question.posterRole)}</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => onPressImage(question.imageUrl)}
          style={[styles.media, { height: Math.round(height * MEDIA_SHARE) }]}
          accessibilityRole="imagebutton"
          accessibilityLabel="Soru görseli"
          accessibilityHint="Görseli büyütür"
        >
          <Image
            source={{ uri: question.imageUrl }}
            style={styles.image}
            contentFit="contain"
            transition={duration.normal}
            accessibilityIgnoresInvertColors
            accessible={false}
          />
        </Pressable>

        {caption ? <Text style={styles.caption}>{caption}</Text> : null}

        {community?.band === "challenging" ? (
          <StatusLabel icon="people-outline" tone="neutral" textStyle={styles.communityText}>
            {COMMUNITY_FEED_SENTENCE}
          </StatusLabel>
        ) : null}

        {choices ? (
          <MultipleChoiceAnswer
            choices={choices}
            correctChoice={question.correctChoice}
            questionId={question.id}
            isStudent={isStudent}
            choiceFeedback={question.choiceFeedback}
            onOutcomeRecorded={(outcome) => onOutcomeRecorded(outcome, question)}
          />
        ) : null}

        <QuestionHintLadder hints={question.hints} />

        {!isMultipleChoice ? (
          <PrimaryButton
            label="Cevapla"
            onPress={openAnswer}
            accessibilityHint="Bu soruya cevap verme ekranını açar; sonra kaydırarak nasıl gittiğini işaretlersin"
          />
        ) : null}

        <View style={styles.actions}>
          <Action
            icon="heart-outline"
            activeIcon="heart"
            active={liked}
            activeColor={colors.accent}
            label={liked ? "Beğendin" : "Beğen"}
            count={likeCount}
            onPress={toggleLike}
          />
          <Action
            icon="chatbubble-outline"
            label="Tartış"
            count={question.commentCount}
            onPress={openDetail}
            hint="Sorunun yorumlarını ve cevaplarını açar"
          />
          <Action
            icon="bookmark-outline"
            activeIcon="bookmark"
            active={saved}
            activeColor={colors.primary}
            label={saved ? "Kaydedildi" : "Kaydet"}
            onPress={toggleSaved}
          />
          {hasNext ? (
            <Action icon="arrow-down-circle-outline" label="Sonraki" onPress={onNext} hint="Sonraki soruya geçer" />
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

interface ActionProps {
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon?: keyof typeof Ionicons.glyphMap;
  active?: boolean;
  activeColor?: string;
  label: string;
  count?: number;
  onPress: () => void;
  hint?: string;
}

/** A compact action: glyph, word, and a real count when one exists. The
 *  count is the document's own field — nothing here is invented. */
function Action({ icon, activeIcon, active = false, activeColor, label, count, onPress, hint }: ActionProps) {
  const tint = active && activeColor ? activeColor : colors.textSecondary;
  const hasCount = typeof count === "number" && count > 0;
  return (
    <AnimatedPressable
      onPress={onPress}
      style={styles.action}
      accessibilityRole="button"
      accessibilityLabel={hasCount ? `${label}, ${count}` : label}
      accessibilityState={{ selected: active }}
      accessibilityHint={hint}
    >
      <Ionicons name={active && activeIcon ? activeIcon : icon} size={iconSize.md} color={tint} accessibilityElementsHidden />
      <Text style={[styles.actionText, active ? { color: tint } : null]} numberOfLines={1}>
        {hasCount ? `${label} · ${formatCount(count)}` : label}
      </Text>
    </AnimatedPressable>
  );
}

// memo'd for the same reason FeedCard is: a like/save toggle on one page
// re-renders the list, and every mounted page would re-render with it.
export const QuestionFeedPage = memo(QuestionFeedPageComponent);

const styles = themedStyles(() => ({
  flex: {
    flex: 1,
  },
  page: {
    width: "100%",
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xxs,
    flexShrink: 1,
  },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryMuted,
  },
  tagText: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.primary,
  },
  tagQuiet: {
    backgroundColor: colors.surfaceMuted,
  },
  tagQuietText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  author: {
    alignItems: "flex-end",
    flexShrink: 1,
    minHeight: minTouchTarget - spacing.sm,
    justifyContent: "center",
  },
  authorText: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  authorRole: {
    ...typography.label,
    color: colors.textTertiary,
  },
  media: {
    width: "100%",
    borderRadius: radius.xl,
    overflow: "hidden",
    backgroundColor: colors.surfaceMuted,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  caption: {
    ...typography.body,
    color: colors.textPrimary,
  },
  communityText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  actionText: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.textSecondary,
  },
}));
