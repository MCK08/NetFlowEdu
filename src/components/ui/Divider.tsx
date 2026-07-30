import { memo } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";

import { colors } from "@theme/colors";

interface DividerProps {
  style?: ViewStyle;
  inset?: number;
}

export const Divider = memo(function Divider({ style, inset = 0 }: DividerProps) {
  return <View style={[styles.line, inset ? { marginLeft: inset } : null, style]} />;
});

const styles = StyleSheet.create({
  line: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
  },
});
