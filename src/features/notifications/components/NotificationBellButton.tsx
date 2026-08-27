import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Text, View } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";

import { useUnreadNotificationCount } from "../hooks/useUnreadNotificationCount";
import { formatUnreadBadge, unreadBadgeAccessibilityLabel } from "../services/unreadBadge";

interface NotificationBellButtonProps {
  uid: string | undefined;
  // Student and teacher headers live in different route groups — the
  // caller states its own group's notification screen path rather than
  // this component guessing a role.
  route: string;
}

// Placed in TeacherDashboardHeader and StudentClassesScreen's header row
// (see Phase 15 report — the two existing header surfaces this was added
// to without altering either tab bar's structure). Reuses IconButton's own
// >=44pt hit target; the badge is a purely visual overlay on top of it.
export function NotificationBellButton({ uid, route }: NotificationBellButtonProps) {
  const unreadCount = useUnreadNotificationCount(uid);
  const badgeLabel = formatUnreadBadge(unreadCount);

  return (
    <AnimatedPressable
      onPress={() => router.push(route as never)}
      accessibilityRole="button"
      accessibilityLabel="Bildirimler"
      accessibilityHint={unreadBadgeAccessibilityLabel(unreadCount)}
      hitSlop={8}
      style={styles.hitArea}
    >
      <Ionicons name="notifications-outline" size={iconSize.md} color={colors.textSecondary} />
      {badgeLabel ? (
        <View style={styles.badge} pointerEvents="none">
          <Text style={styles.badgeText} numberOfLines={1}>
            {badgeLabel}
          </Text>
        </View>
      ) : null}
    </AnimatedPressable>
  );
}

const styles = themedStyles(() => ({
  hitArea: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: radius.pill,
    paddingHorizontal: 3,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    ...typography.label,
    fontSize: 9,
    lineHeight: 11,
    color: colors.textInverse,
  },
}));
