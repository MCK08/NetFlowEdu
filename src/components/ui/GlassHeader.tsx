import { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";

interface GlassHeaderProps {
  children: ReactNode;
}

// NOTE: `expo-blur` is NOT installed in this project (checked
// package.json) — a true frosted-glass blur is not implemented here.
// Adding a new native dependency is a tooling decision outside a
// "foundation only" phase's scope, so this renders a translucent, tinted
// surface instead (same visual family — a soft floating header bar —
// without the actual blur). Swap the View's backgroundColor for
// expo-blur's <BlurView> in a future phase if/when that dependency is
// approved and added.
export function GlassHeader({ children }: GlassHeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xs }]}>{children}</View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "rgba(255,255,255,0.85)",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
});
