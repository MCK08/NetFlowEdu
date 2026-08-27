import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { memo } from "react";
import { Text, View } from "react-native";

import {
  FeedActionRail,
  FeedAuthorHeader,
  FeedCaption,
  FeedImage,
  FeedPill,
  FeedScrim,
} from "@components/feed";
import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { useAuth } from "@features/authentication";
import { useProfileHandle } from "@features/profiles";
import { useSavedQuestion } from "@features/questions";
import { useLike } from "@features/social/likes";
import { colors, darkColors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";
import { formatRelativeTime } from "@utils/feedFormat";
import { roleLabel } from "@utils/roleLabels";
import { Question } from "@/types/question";

import { useNavigationGuard } from "@hooks/useNavigationGuard";
import { useThemeSubscription } from "@theme/ThemeProvider";

interface ClassFeedCardProps {
  question: Question;
  className: string;
  height: number;
  topInset: number;
  bottomInset: number;
}

// Space the bottom overlay needs before the action rail may start, so the
// rail never collides with the caption block underneath it.
const BOTTOM_OVERLAY_RESERVE = 210;

// One full-screen question in the class feed.
//
// Every social action here is the SAME production implementation the public
// feed and question detail use (useLike, useSavedQuestion, useProfileHandle)
// — this card owns no like/save/comment logic of its own. Comments and
// answering intentionally navigate to the existing screens rather than
// re-implementing those flows inline.
//
// memo'd on the props that actually change: without it, every like/save
// count update in the list would re-render all mounted cards.
function ClassFeedCardComponent({
  question,
  className,
  height,
  topInset,
  bottomInset,
}: ClassFeedCardProps) {
  // Phase 49 — memo() blocks prop-driven re-renders, but NOT context
  // updates; without this subscription this component would keep its
  // previous theme's styles after a live theme switch.
  useThemeSubscription();
  const { firebaseUser } = useAuth();
  const { primaryName, usernameHandle, photoURL } = useProfileHandle(question.ownerId);
  const { liked, likeCount, toggle } = useLike({
    targetType: "question",
    targetId: question.id,
    initialLikeCount: question.likeCount,
    uid: firebaseUser?.uid,
  });
  const { saved, toggle: toggleSaved } = useSavedQuestion(question, firebaseUser?.uid);

  // expo-router's push() does not deduplicate, so an unguarded double-tap
  // stacks the same screen twice. The lock is held until this screen is
  // focused again (the user came back) rather than for a fixed cooldown —
  // see useNavigationGuard for why a timer was the wrong primitive. Keyed,
  // so tapping "Cevapla" never blocks a legitimate tap on comments.
  const guardedNavigate = useNavigationGuard();
  const subject = question.subject?.trim();
  const postedAt = formatRelativeTime(question.createdAt);

  function openOwnerProfile() {
    if (!question.ownerId) return;
    guardedNavigate("profile", () => {
      router.push({ pathname: "/(student)/user/[userId]", params: { userId: question.ownerId } });
    });
  }

  // Comments live on the question detail screen — reused, not duplicated.
  function openComments() {
    guardedNavigate("comments", () => {
      router.push({
        pathname: "/(student)/question/[questionId]",
        params: { questionId: question.id },
      });
    });
  }

  // The existing answer-upload flow, unchanged.
  function openAnswer() {
    guardedNavigate("answer", () => {
      router.push({
        pathname: "/(student)/answer/[questionId]",
        params: { questionId: question.id },
      });
    });
  }

  return (
    <View style={[styles.card, { height }]}>
      <FeedImage uri={question.imageUrl} contentFit="contain" accessibilityLabel="Soru görseli" />

      {/* Gradient scrims keep the overlays legible over an arbitrary
          question image without washing out the question itself. */}
      <FeedScrim placement="top" height={topInset + 96} />
      <FeedScrim placement="bottom" height={bottomInset + BOTTOM_OVERLAY_RESERVE + 60} />

      <View
        style={[styles.actionRail, { bottom: bottomInset + BOTTOM_OVERLAY_RESERVE }]}
        pointerEvents="box-none"
      >
        <FeedActionRail
          liked={liked}
          likeCount={likeCount}
          onToggleLike={toggle}
          commentCount={question.commentCount}
          onOpenComments={openComments}
          answerCount={question.answerCount}
          saved={saved}
          onToggleSave={toggleSaved}
        />
      </View>

      <View style={[styles.bottomBar, { paddingBottom: bottomInset + spacing.md }]}>
        <FeedAuthorHeader
          photoURL={photoURL}
          primaryName={primaryName}
          usernameHandle={usernameHandle}
          // Teacher and student questions now share one class feed, so who
          // posted is no longer implicit the way it was when only teachers
          // could publish here.
          roleLabel={roleLabel(question.posterRole)}
          onPress={openOwnerProfile}
          meta={
            <>
              {subject ? <FeedPill label={subject} icon="pricetag-outline" /> : null}
              <FeedPill label={className} icon="school-outline" />
              {postedAt ? <Text style={styles.timestamp}>{postedAt}</Text> : null}
            </>
          }
        />

        <FeedCaption description={question.description} />

        <AnimatedPressable
          onPress={openAnswer}
          style={styles.answerButton}
          accessibilityRole="button"
          accessibilityLabel="Bu soruyu cevapla"
        >
          <Ionicons name="create-outline" size={18} color={darkColors.background} />
          <Text style={styles.answerButtonText}>Cevapla</Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

export const ClassFeedCard = memo(ClassFeedCardComponent);

const styles = themedStyles(() => ({
  card: {
    width: "100%",
    backgroundColor: darkColors.background,
  },
  actionRail: {
    position: "absolute",
    right: spacing.sm,
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.md,
    // Clears the action rail so a long name or caption can never run
    // underneath it.
    paddingRight: 78,
    gap: spacing.sm,
  },
  timestamp: {
    ...typography.label,
    color: colors.textInverse,
    opacity: 0.7,
  },
  answerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    alignSelf: "flex-start",
    minHeight: 48,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    backgroundColor: colors.textInverse,
  },
  answerButtonText: {
    ...typography.subtitle,
    fontWeight: "700",
    color: darkColors.background,
  },
}));
