import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { useAuth } from "@features/authentication";
import { useProfileHandle } from "@features/profiles";
import { SaveButton, useSavedQuestion } from "@features/questions";
import { LikeButton, useLike } from "@features/social/likes";
import { colors, darkColors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { minTouchTarget } from "@theme/sizes";
import { Question } from "@/types/question";

import { useNavigationGuard } from "@hooks/useNavigationGuard";

interface ClassFeedCardProps {
  question: Question;
  className: string;
  height: number;
  topInset: number;
  bottomInset: number;
}

function formatCount(value: number): string {
  // Large counts must not blow out the fixed-width action rail.
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}B`;
  return String(value);
}

// One full-screen question in the class feed.
//
// Every social action here is the SAME production implementation the public
// feed and question detail use (useLike, useSavedQuestion, useProfileHandle,
// LikeButton, SaveButton) — this phase adds no parallel like/save/comment
// system. Comments and answering intentionally navigate to the existing
// screens rather than re-implementing those flows inline.
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
  const isTeacherPost = question.posterRole === "teacher";

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
      <Image
        source={{ uri: question.imageUrl }}
        style={styles.image}
        // contain (not cover): a maths question cropped at the edges is
        // unreadable, which defeats the entire point of the feed.
        contentFit="contain"
        transition={120}
        accessibilityLabel="Soru görseli"
      />

      {/* Scrims keep white text legible over arbitrary question images
          without washing out the question itself. */}
      <View pointerEvents="none" style={[styles.topScrim, { height: topInset + 72 }]} />
      <View pointerEvents="none" style={[styles.bottomScrim, { height: bottomInset + 190 }]} />

      <View style={[styles.actionRail, { bottom: bottomInset + 148 }]}>
        <LikeButton liked={liked} likeCount={likeCount} onPress={toggle} />

        <AnimatedPressable
          onPress={openComments}
          style={styles.actionButton}
          accessibilityRole="button"
          accessibilityLabel={`Yorumlar, ${question.commentCount}`}
        >
          <Ionicons name="chatbubble-outline" size={26} color={colors.textInverse} />
          <Text style={styles.actionCount}>{formatCount(question.commentCount)}</Text>
        </AnimatedPressable>

        <View
          style={styles.actionButton}
          accessible
          accessibilityLabel={`Cevap sayısı, ${question.answerCount}`}
        >
          <Ionicons name="documents-outline" size={26} color={colors.textInverse} />
          <Text style={styles.actionCount}>{formatCount(question.answerCount)}</Text>
        </View>

        <SaveButton saved={saved} onPress={toggleSaved} />
      </View>

      <View style={[styles.bottomBar, { paddingBottom: bottomInset + 16 }]}>
        <AnimatedPressable
          style={styles.posterRow}
          onPress={openOwnerProfile}
          accessibilityRole="button"
          accessibilityLabel="Profili görüntüle"
        >
          {photoURL ? (
            <Image source={{ uri: photoURL }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={16} color={colors.textInverse} />
            </View>
          )}
          <View style={styles.nameColumn}>
            <View style={styles.nameRow}>
              <Text style={styles.posterName} numberOfLines={1}>
                {primaryName}
              </Text>
              {/* Who actually posted this — teacher and student questions
                  now share the same class feed, so this is no longer
                  implicit the way it was when only teachers could post.
                  Same pill pattern as ChatMessageBubble's "Öğretmen" badge. */}
              <View style={[styles.roleBadge, isTeacherPost ? styles.roleBadgeTeacher : styles.roleBadgeStudent]}>
                <Text style={styles.roleBadgeText}>{isTeacherPost ? "Öğretmen" : "Öğrenci"}</Text>
              </View>
            </View>
            {usernameHandle ? (
              <Text style={styles.handle} numberOfLines={1}>
                {usernameHandle}
              </Text>
            ) : null}
          </View>
          <View style={styles.classBadge}>
            <Ionicons name="school-outline" size={12} color={colors.textInverse} />
            <Text style={styles.classBadgeText} numberOfLines={1}>
              {className}
            </Text>
          </View>
        </AnimatedPressable>

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

const styles = StyleSheet.create({
  card: {
    width: "100%",
    backgroundColor: darkColors.background,
  },
  image: {
    flex: 1,
  },
  topScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(11,11,15,0.55)",
  },
  bottomScrim: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(11,11,15,0.72)",
  },
  actionRail: {
    position: "absolute",
    right: spacing.sm,
    alignItems: "center",
    gap: 18,
  },
  actionButton: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
  },
  actionCount: {
    color: colors.textInverse,
    fontSize: 12,
    fontWeight: "600",
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  posterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: minTouchTarget,
    paddingRight: 72,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  avatarPlaceholder: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  nameColumn: {
    flexShrink: 1,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  posterName: {
    color: colors.textInverse,
    fontSize: 15,
    fontWeight: "700",
    flexShrink: 1,
  },
  roleBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  roleBadgeTeacher: {
    backgroundColor: colors.primary,
  },
  roleBadgeStudent: {
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textInverse,
  },
  handle: {
    color: colors.textInverse,
    fontSize: 12,
    opacity: 0.8,
  },
  classBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    flexShrink: 1,
    maxWidth: 140,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: spacing.xxs,
  },
  classBadgeText: {
    color: colors.textInverse,
    fontSize: 11,
    fontWeight: "600",
    flexShrink: 1,
  },
  answerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: colors.textInverse,
  },
  answerButtonText: {
    color: darkColors.background,
    fontSize: 16,
    fontWeight: "700",
  },
});
