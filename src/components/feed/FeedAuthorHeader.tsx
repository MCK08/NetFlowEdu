import { memo, ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { Avatar } from "@components/ui/Avatar";
import { colors } from "@theme/colors";
import { minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

import { FeedPill } from "./FeedPill";

interface FeedAuthorHeaderProps {
  photoURL: string | null;
  primaryName: string;
  usernameHandle: string | null;
  // Rendered as an accent pill next to the name. Null hides it entirely
  // rather than showing an empty chip.
  roleLabel: string | null;
  onPress: () => void;
  // Second line under the handle — the card decides what belongs there
  // (subject, class, timestamp, visibility), since the two feeds surface
  // genuinely different metadata.
  meta?: ReactNode;
}

// The identity block both feed cards render above the caption.
//
// Previously each card hand-rolled its own avatar branch (`photoURL ?
// <Image> : <View><Ionicons/></View>`) at a different diameter — 34px in
// the class feed, 28px in the public feed — with its own name/handle
// styles. This uses the shared Avatar primitive (which also brings the
// initials fallback both cards were missing) at one consistent size, so
// the two feeds finally read as the same product.
export const FeedAuthorHeader = memo(function FeedAuthorHeader({
  photoURL,
  primaryName,
  usernameHandle,
  roleLabel,
  onPress,
  meta,
}: FeedAuthorHeaderProps) {
  return (
    <AnimatedPressable
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${primaryName} profilini görüntüle`}
    >
      <Avatar photoURL={photoURL} displayName={primaryName} size="md" />

      <View style={styles.textColumn}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {primaryName}
          </Text>
          {roleLabel ? <FeedPill label={roleLabel} tone="accent" /> : null}
        </View>

        {usernameHandle ? (
          <Text style={styles.handle} numberOfLines={1}>
            {usernameHandle}
          </Text>
        ) : null}

        {meta ? <View style={styles.metaRow}>{meta}</View> : null}
      </View>
    </AnimatedPressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: minTouchTarget,
  },
  textColumn: {
    flex: 1,
    gap: 3,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  name: {
    ...typography.subtitle,
    fontWeight: "700",
    color: colors.textInverse,
    flexShrink: 1,
  },
  handle: {
    ...typography.caption,
    color: colors.textInverse,
    opacity: 0.75,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    flexWrap: "wrap",
    marginTop: 2,
  },
});
