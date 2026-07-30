import { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Edge, SafeAreaView } from "react-native-safe-area-context";

import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";

interface ScreenContainerProps {
  children: ReactNode;
  edges?: readonly Edge[];
  padded?: boolean;
}

// A lighter-weight screen wrapper than KeyboardSafeScreen (which bundles a
// ScrollView + KeyboardAvoidingView specifically for scrollable forms) —
// for screens that just need a safe-area + background + optional padding,
// without forcing scroll/keyboard-avoidance behavior they don't need.
export function ScreenContainer({
  children,
  edges = ["top", "bottom"],
  padded = false,
}: ScreenContainerProps) {
  return (
    <SafeAreaView style={styles.flex} edges={edges}>
      <View style={[styles.flex, padded ? styles.padded : null]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  padded: {
    padding: spacing.xl,
  },
});
