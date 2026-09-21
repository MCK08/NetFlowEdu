import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { memo, useCallback, useState } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";

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

/** Past this OS text scale the meta row stops being a row. Found on the
 *  simulator at the largest accessibility size: the subject truncated to
 *  "Denkle…" while the author's role broke mid-word ("Öğretme / n"), because
 *  two shrinking columns were sharing one line. Stacked, each gets the full
 *  width. */
const STACK_ABOVE_FONT_SCALE = 1.3;

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
  const { fontScale } = useWindowDimensions();
  const stackedMeta = fontScale > STACK_ABOVE_FONT_SCALE;
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
  const grade = question.gradeLevel.trim();
  // Phase 116 — the second meta line, from fields the document already has.
  // The type is read from the choices themselves (the same test that decides
  // which answer UI renders), so it can never disagree with what is below it.
  const facts = [grade ? `${grade}. Sınıf` : null, isMultipleChoice ? "Çoktan seçmeli" : "Açık uçlu"]
    .filter(Boolean)
    .join(" · ");
  // A question whose image fails (a deleted upload, a demo fixture that
  // 404s) previously kept its full 40%-of-the-page box, so the screen's
  // largest object was an empty grey rectangle. On failure the media
  // collapses to a short, calm strip instead and the question keeps the room.
  const [imageFailed, setImageFailed] = useState(false);

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
        <View style={[styles.metaRow, stackedMeta ? styles.metaRowStacked : null]}>
          <View style={styles.meta}>
            {subject || topic ? (
              <Text style={styles.subjectLine} numberOfLines={2}>
                {[subject, topic].filter(Boolean).join("  •  ")}
              </Text>
            ) : null}
            {facts ? <Text style={styles.factsLine}>{facts}</Text> : null}
          </View>
          <Pressable
            onPress={openAuthor}
            style={[styles.author, stackedMeta ? styles.authorStacked : null]}
            accessibilityRole="button"
            accessibilityLabel={`${author.primaryName}, ${roleLabel(question.posterRole)}. Profili aç`}
            hitSlop={8}
          >
            <Text style={styles.authorText} numberOfLines={stackedMeta ? 2 : 1}>
              {author.primaryName}
            </Text>
            <Text style={styles.authorRole}>{roleLabel(question.posterRole)}</Text>
          </Pressable>
        </View>

        {imageFailed ? (
          <View style={styles.mediaFallback} accessible accessibilityLabel="Soru görseli yüklenemedi">
            <Ionicons
              name="image-outline"
              size={iconSize.md}
              color={colors.textTertiary}
              accessibilityElementsHidden
            />
            <Text style={styles.mediaFallbackText}>Görsel yüklenemedi</Text>
          </View>
        ) : (
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
              onError={() => setImageFailed(true)}
              accessibilityIgnoresInvertColors
              accessible={false}
            />
          </Pressable>
        )}

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

        {/* Phase 116 — support, then the way forward.
            These three were four equal pills, and "Sonraki" was one of them:
            the single thing a student does after every question looked
            exactly like "Beğen". Support stays compact and secondary; moving
            on is the page's one filled button. Swiping still works — the
            pager is untouched — this is the reachable, announceable way to
            do the same thing. */}
        <View style={styles.actions}>
          <Action
            icon="bookmark-outline"
            activeIcon="bookmark"
            active={saved}
            activeColor={colors.primary}
            label={saved ? "Kaydedildi" : "Kaydet"}
            onPress={toggleSaved}
          />
          <Action
            icon="chatbubble-outline"
            label="Tartış"
            count={question.commentCount}
            onPress={openDetail}
            hint="Sorunun yorumlarını ve cevaplarını açar"
          />
          <Action
            icon="heart-outline"
            activeIcon="heart"
            active={liked}
            activeColor={colors.accent}
            label={liked ? "Beğendin" : "Beğen"}
            count={likeCount}
            onPress={toggleLike}
          />
        </View>

        {hasNext ? (
          <PrimaryButton
            label="Sonraki"
            onPress={onNext}
            // On an open-ended question "Cevapla" is the thing to do, so
            // moving on steps back to a secondary button rather than
            // standing beside it as a second filled call to action.
            variant={isMultipleChoice ? "primary" : "secondary"}
            accessibilityHint="Sonraki soruya geçer"
          />
        ) : null}
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
  metaRowStacked: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.xxs,
  },
  // Phase 116 — two quiet lines instead of two filled chips. The chips gave
  // the subject and topic the same visual weight as an action, so the top of
  // every page read as UI; as text they name the question and step back.
  meta: {
    flexShrink: 1,
    minWidth: 0,
    gap: 2,
  },
  subjectLine: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.primary,
  },
  factsLine: {
    ...typography.label,
    color: colors.textTertiary,
  },
  author: {
    alignItems: "flex-end",
    flexShrink: 1,
    minHeight: minTouchTarget - spacing.sm,
    justifyContent: "center",
  },
  authorStacked: {
    alignItems: "flex-start",
    alignSelf: "stretch",
    flexShrink: 0,
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
  mediaFallback: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceMuted,
  },
  mediaFallbackText: {
    ...typography.caption,
    color: colors.textTertiary,
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
