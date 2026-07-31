import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { formatCount } from "@utils/feedFormat";

const ICON_SIZE = 24;

interface FeedActionRailProps {
  liked: boolean;
  likeCount: number;
  onToggleLike: () => void;
  commentCount: number;
  // Omitted by the public feed, where the whole card is one Pressable that
  // opens the detail screen — making the comment icon separately pressable
  // there would change existing navigation behavior, so it stays a plain
  // (but still screen-reader announced) indicator.
  onOpenComments?: () => void;
  answerCount: number;
  saved: boolean;
  onToggleSave: () => void;
}

interface ActionProps {
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon?: keyof typeof Ionicons.glyphMap;
  active?: boolean;
  activeColor?: string;
  count?: number;
  label: string;
  onPress?: () => void;
}

// One action = a circular translucent puck + count underneath.
//
// The puck is the reason this reads as "designed" rather than "icons
// floating on a photo": a bare white glyph over a bright question image
// (a photographed exam paper is mostly white) was previously almost
// invisible, and no scrim reaches the right rail. The puck guarantees
// contrast regardless of what the image behind it looks like.
function Action({ icon, activeIcon, active = false, activeColor, count, label, onPress }: ActionProps) {
  const glyph = active && activeIcon ? activeIcon : icon;
  const tint = active && activeColor ? activeColor : colors.textInverse;

  const body = (
    <>
      <View style={[styles.puck, active ? styles.puckActive : null]}>
        <Ionicons name={glyph} size={ICON_SIZE} color={tint} />
      </View>
      {count === undefined ? null : <Text style={styles.count}>{formatCount(count)}</Text>}
    </>
  );

  if (!onPress) {
    return (
      <View style={styles.action} accessible accessibilityLabel={label}>
        {body}
      </View>
    );
  }

  return (
    <AnimatedPressable
      onPress={onPress}
      style={styles.action}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      hitSlop={6}
    >
      {body}
    </AnimatedPressable>
  );
}

// The vertical like/comment/answer/save column shared by both feeds.
//
// Replaces two separately-drifted copies: the class feed formatted its
// counts but the public feed printed raw numbers (a 1200-like question
// rendered "1200" and broke the rail's alignment), and only the class feed
// had accessibility labels on comment/answer. Every callback, count and
// optimistic-update source stays exactly where it was — this component
// receives them, it never owns them.
export const FeedActionRail = memo(function FeedActionRail({
  liked,
  likeCount,
  onToggleLike,
  commentCount,
  onOpenComments,
  answerCount,
  saved,
  onToggleSave,
}: FeedActionRailProps) {
  return (
    <View style={styles.rail}>
      <Action
        icon="heart-outline"
        activeIcon="heart"
        active={liked}
        activeColor={colors.accent}
        count={likeCount}
        label={liked ? "Beğeniyi geri al" : "Beğen"}
        onPress={onToggleLike}
      />
      <Action
        icon="chatbubble-outline"
        count={commentCount}
        label={`Yorumlar, ${commentCount}`}
        onPress={onOpenComments}
      />
      <Action
        icon="documents-outline"
        count={answerCount}
        label={`Cevap sayısı, ${answerCount}`}
      />
      <Action
        icon="bookmark-outline"
        activeIcon="bookmark"
        active={saved}
        activeColor={colors.primary}
        label={saved ? "Kaydı kaldır" : "Kaydet"}
        onPress={onToggleSave}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  rail: {
    alignItems: "center",
    gap: spacing.md,
  },
  action: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
  },
  puck: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(11,11,15,0.38)",
  },
  puckActive: {
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  count: {
    ...typography.label,
    color: colors.textInverse,
  },
});
