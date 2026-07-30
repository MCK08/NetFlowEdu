import { memo, ReactNode } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { shadows } from "@theme/shadows";
import { spacing } from "@theme/spacing";

interface CardProps {
  children: ReactNode;
  style?: ViewStyle;
  // "flat" matches the existing borderless `#F7F7F8` panel style already
  // used by ProfileScreen's info card; "elevated" adds a soft shadow for
  // surfaces that need to visually float (e.g. a modal's content).
  variant?: "flat" | "elevated";
}

// Generic container the app currently re-implements per-screen as an
// inline `card: { backgroundColor: "#F7F7F8", borderRadius: 16, padding: 16 }`
// style (ProfileScreen being the clearest example). New screens/sections
// should reach for this instead of redefining the same object.
export const Card = memo(function Card({ children, style, variant = "flat" }: CardProps) {
  return (
    <View style={[styles.base, variant === "elevated" ? shadows.md : null, style]}>
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
  },
});
