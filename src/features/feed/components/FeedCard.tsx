import { router } from "expo-router";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import {
  FeedActionRail,
  FeedAuthorHeader,
  FeedCaption,
  FeedImage,
  FeedPill,
  FeedScrim,
} from "@components/feed";
import { useAuth } from "@features/authentication";
import { useProfileHandle } from "@features/profiles";
import { useSavedQuestion } from "@features/questions";
import { useLike } from "@features/social/likes";
import { colors, darkColors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";
import { formatRelativeTime } from "@utils/feedFormat";
import { visibilityLabel } from "@utils/questionLabels";
import { roleLabel } from "@utils/roleLabels";

import { Question } from "../types";
import { useThemeSubscription } from "@theme/ThemeProvider";

interface FeedCardProps {
  question: Question;
  height: number;
}

// Height reserved at the bottom for the overlay block, so the action rail
// sits clear of the author/caption content.
const BOTTOM_OVERLAY_RESERVE = 150;

// Phase 54 — the floating camera button (CameraButton: absolute, bottom 32,
// 68pt tall) occupies 32–100pt from the bottom of this same screen. In the
// immersive pager the card fills that whole area, so an overlay anchored at
// the old bottom: spacing.xl ran straight underneath it and the button sat
// on top of the author row. Anchoring the overlay above the button's top
// edge is what keeps both usable, and it is measured from the button's real
// geometry rather than a guessed constant.
const CAMERA_BUTTON_CLEARANCE = 112;

// Tapping anywhere on the card opens Question Detail, which is the single
// entry point into the answer flow (its own "Cevapla" button pushes
// AnswerScreen) — nested Pressables (owner row, like button) still win
// over the card's own tap, RN only fires the innermost responder for a
// touch. That is also why the comment/answer counts stay non-interactive
// here: making them their own Pressables would silently change where a tap
// in that area navigates.
function FeedCardComponent({ question, height }: FeedCardProps) {
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

  const subject = question.subject?.trim();
  const postedAt = formatRelativeTime(question.createdAt);

  function openDetail() {
    router.push({ pathname: "/(student)/question/[questionId]", params: { questionId: question.id } });
  }

  function openOwnerProfile() {
    if (!question.ownerId) return;
    router.push({ pathname: "/(student)/user/[userId]", params: { userId: question.ownerId } });
  }

  return (
    <Pressable
      style={[styles.card, { height }]}
      onPress={openDetail}
      accessibilityRole="button"
      accessibilityLabel="Soruyu aç"
    >
      <FeedImage uri={question.imageUrl} contentFit="cover" accessibilityLabel="Soru görseli" />

      {/* The public feed previously laid white text straight onto the
          photograph with no scrim at all — unreadable over any light
          question image. */}
      <FeedScrim placement="top" height={96} />
      <FeedScrim placement="bottom" height={BOTTOM_OVERLAY_RESERVE + CAMERA_BUTTON_CLEARANCE + 60} />

      <View style={styles.actionRail} pointerEvents="box-none">
        <FeedActionRail
          liked={liked}
          likeCount={likeCount}
          onToggleLike={toggle}
          commentCount={question.commentCount}
          answerCount={question.answerCount}
          saved={saved}
          onToggleSave={toggleSaved}
        />
      </View>

      <View style={styles.infoOverlay}>
        <FeedAuthorHeader
          photoURL={photoURL}
          primaryName={primaryName}
          usernameHandle={usernameHandle}
          roleLabel={roleLabel(question.posterRole)}
          onPress={openOwnerProfile}
          meta={
            <>
              {subject ? <FeedPill label={subject} icon="pricetag-outline" /> : null}
              <FeedPill label={visibilityLabel(question.visibility)} />
              {postedAt ? <Text style={styles.timestamp}>{postedAt}</Text> : null}
            </>
          }
        />

        <FeedCaption description={question.description} />

        {/* Phase 26 §5 — an explicit primary action, not just "tap
            anywhere". Same destination as the card's own onPress
            (openDetail) — this is a visible label for what tapping the
            card already does, not a second navigation path. */}
        <View style={styles.solveRow}>
          <FeedPill label="Çöz" icon="arrow-forward-circle" tone="accent" />
        </View>
      </View>
    </Pressable>
  );
}

// memo'd for the same reason as ClassFeedCard: a like/save toggle on one
// card re-renders FeedScreen's list, and without this every mounted card
// re-renders with it.
export const FeedCard = memo(FeedCardComponent);

const styles = themedStyles(() => ({
  card: {
    width: "100%",
    backgroundColor: darkColors.background,
  },
  actionRail: {
    position: "absolute",
    right: spacing.sm,
    bottom: BOTTOM_OVERLAY_RESERVE + CAMERA_BUTTON_CLEARANCE,
  },
  infoOverlay: {
    position: "absolute",
    left: spacing.md,
    right: 78,
    bottom: CAMERA_BUTTON_CLEARANCE,
  },
  timestamp: {
    ...typography.label,
    color: colors.textInverse,
    opacity: 0.7,
  },
  solveRow: {
    marginTop: spacing.sm,
    flexDirection: "row",
  },
}));
