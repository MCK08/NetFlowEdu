import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Text, View } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { Avatar } from "@components/ui/Avatar";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";
import { NotificationRecord } from "@/types/notification";

import { notificationAccessibilityLabel, presentNotification } from "../services/notificationPresentation";
import { useThemeSubscription } from "@theme/ThemeProvider";

interface NotificationRowProps {
  notification: NotificationRecord;
  onPress: (notification: NotificationRecord) => void;
}

function formatTimestamp(createdAt: number): string {
  if (!createdAt) return "";
  return new Date(createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

// One row = one notification. Memoized on the notification object itself
// (a plain value, replaced wholesale by applyReadTransition/
// mergeNotificationPages rather than mutated) plus a stable onPress from
// the screen — Stage 13's "stabil renderItem" requirement.
export const NotificationRow = memo(function NotificationRow({
  notification,
  onPress,
}: NotificationRowProps) {
  // Phase 49 — memo() blocks prop-driven re-renders, but NOT context
  // updates; without this subscription this component would keep its
  // previous theme's styles after a live theme switch.
  useThemeSubscription();
  const presentation = presentNotification(notification);
  const accessibilityLabel = notificationAccessibilityLabel(notification, presentation);

  return (
    <AnimatedPressable
      onPress={() => onPress(notification)}
      style={[styles.row, notification.isRead ? null : styles.rowUnread]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: !notification.isRead }}
    >
      <View style={styles.avatarStack}>
        <Avatar photoURL={notification.actorPhotoURL} displayName={notification.actorDisplayName} size="md" />
        <View style={styles.iconBadge}>
          <Ionicons name={presentation.icon} size={12} color={colors.textInverse} />
        </View>
      </View>

      <View style={styles.textColumn}>
        <Text style={styles.title} numberOfLines={2}>
          {presentation.title}
        </Text>
        {presentation.secondaryText ? (
          <Text style={styles.secondary} numberOfLines={1}>
            {presentation.secondaryText}
          </Text>
        ) : null}
        <Text style={styles.timestamp}>{formatTimestamp(notification.createdAt)}</Text>
      </View>

      {!notification.isRead ? <View style={styles.unreadDot} accessibilityElementsHidden /> : null}
    </AnimatedPressable>
  );
});

const styles = themedStyles(() => ({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 64,
  },
  rowUnread: {
    backgroundColor: colors.primaryMuted,
  },
  avatarStack: {
    position: "relative",
  },
  iconBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.background,
  },
  textColumn: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typography.body,
    color: colors.textPrimary,
  },
  secondary: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  timestamp: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    marginTop: 6,
  },
}));
