import { memo } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";

import { colors } from "@theme/colors";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";

interface DividerProps {
  style?: ViewStyle;
  inset?: number;
}

export const Divider = memo(function Divider({ style, inset = 0 }: DividerProps) {
  // Phase 49 — memo() blocks prop-driven re-renders, but NOT context
  // updates; without this subscription this component would keep its
  // previous theme's styles after a live theme switch.
  useThemeSubscription();
  return <View style={[styles.line, inset ? { marginLeft: inset } : null, style]} />;
});

const styles = themedStyles(() => ({
  line: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
  },
}));
