import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

interface ChatErrorBannerProps {
  message: string;
}

// A send failure is a transient, message-scoped problem, so it stays an
// inline banner above the composer rather than taking over the screen —
// the conversation and the composer both remain usable. The message text
// itself is whatever useClassChat's existing Turkish error mapping
// produced; this component never rewrites or genericizes it.
//
// Retrying an individual failed message is the bubble's own action (see
// ChatMessageBubble's "Tekrar dene"), so this banner deliberately has no
// button of its own — nothing here resends anything automatically.
export const ChatErrorBanner = memo(function ChatErrorBanner({ message }: ChatErrorBannerProps) {
  return (
    <View style={styles.banner} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Ionicons name="warning-outline" size={16} color={colors.danger} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginHorizontal: spacing.sm,
    marginBottom: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.dangerMuted,
  },
  text: {
    ...typography.caption,
    color: colors.danger,
    flex: 1,
  },
});
