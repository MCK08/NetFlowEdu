import { Ionicons } from "@expo/vector-icons";
import { memo, ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { Avatar } from "@components/ui/Avatar";
import { RoleBadge } from "@components/ui/RoleBadge";
import { colors } from "@theme/colors";
import { minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { UserRole } from "@/types/user";

interface SocialUserRowProps {
  primaryName: string;
  usernameHandle: string | null;
  photoURL: string | null;
  role: UserRole | null;
  onPress: () => void;
  // Screen-reader summary of what this row is in its current context
  // ("Gelen istek: Ayşe, Öğretmen"), so the row's meaning does not depend
  // on the visual position of its action buttons.
  accessibilityLabel: string;
  isBusy?: boolean;
  // Trailing actions differ per surface (friend list / incoming / outgoing
  // / search result), so the row never hardcodes them.
  actions?: ReactNode;
}

// The one identity row shared by the friend list, both request lists and
// the search results.
//
// Replaces two separately-drifted hand-rolled implementations: FriendRow
// re-implemented the avatar branch and role pill with hardcoded hex values
// and 32pt action buttons, while FindFriendsScreen had its own near-identical
// copy. Both now go through Avatar and RoleBadge, so a role label or avatar
// fallback can never differ between the two screens again.
export const SocialUserRow = memo(function SocialUserRow({
  primaryName,
  usernameHandle,
  photoURL,
  role,
  onPress,
  accessibilityLabel,
  isBusy = false,
  actions,
}: SocialUserRowProps) {
  return (
    <View style={styles.row}>
      <AnimatedPressable
        style={styles.identity}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint="Profili açar"
      >
        <Avatar photoURL={photoURL} displayName={primaryName} size="md" />

        <View style={styles.textColumn}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {primaryName}
            </Text>
            {role ? <RoleBadge role={role} /> : null}
          </View>
          {usernameHandle ? (
            <Text style={styles.handle} numberOfLines={1}>
              {usernameHandle}
            </Text>
          ) : null}
        </View>

        {!actions ? (
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        ) : null}
      </AnimatedPressable>

      {actions ? (
        <View style={styles.actions}>
          {isBusy ? (
            <ActivityIndicator color={colors.textTertiary} style={styles.busy} />
          ) : (
            actions
          )}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
    minHeight: 64,
  },
  identity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    // Guarantees the tappable identity area meets the touch-target
    // minimum even for a row with no handle line.
    minHeight: minTouchTarget,
  },
  textColumn: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  name: {
    ...typography.subtitle,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  handle: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  busy: {
    minWidth: minTouchTarget,
  },
});
