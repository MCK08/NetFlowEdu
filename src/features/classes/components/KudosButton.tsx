import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { ActivityIndicator, Pressable, Text } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

interface KudosButtonProps {
  /** Whose question this is — spoken, never shown as a count. */
  recipientName: string;
  isSent: boolean;
  isPending: boolean;
  onPress: () => void;
}

// Phase 110 — the one positive gesture: "Tebrik Et".
//
// Its only states are the sender's own: not yet, sending, done. There is no
// number anywhere — not on the button, not beside it — because a visible total
// of congratulations is exactly the popularity mechanic this layer refuses.
// Once sent it says "Tebrik edildi" and stays inert; the server would answer
// "already_sent" anyway, so the button never pretends a second one is possible.
export const KudosButton = memo(function KudosButton({ recipientName, isSent, isPending, onPress }: KudosButtonProps) {
  useThemeSubscription();
  const label = isSent ? "Tebrik edildi" : "Tebrik Et";
  return (
    <Pressable
      onPress={onPress}
      disabled={isSent || isPending}
      accessibilityRole="button"
      accessibilityLabel={isSent ? `${recipientName} tebrik edildi` : `${recipientName} için tebrik gönder`}
      accessibilityState={{ disabled: isSent || isPending, busy: isPending, selected: isSent }}
      style={[styles.button, isSent ? styles.sent : styles.idle]}
    >
      {isPending ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Ionicons
          name={isSent ? "checkmark-circle" : "sparkles-outline"}
          size={iconSize.xs}
          color={isSent ? colors.success : colors.primary}
          accessibilityElementsHidden
        />
      )}
      <Text style={[styles.label, isSent ? styles.labelSent : null]}>{label}</Text>
    </Pressable>
  );
});

const styles = themedStyles(() => ({
  button: {
    minHeight: minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  idle: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  sent: {
    borderColor: colors.divider,
    backgroundColor: colors.surfaceMuted,
  },
  label: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.primary,
  },
  labelSent: {
    color: colors.textSecondary,
  },
}));
