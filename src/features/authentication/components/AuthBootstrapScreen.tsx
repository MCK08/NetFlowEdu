import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

const BOOTSTRAP_MESSAGE = "Oturumun hazırlanıyor…";

// What the app shows while Firebase Auth is rehydrating a stored session
// and the profile document is being read — the window in which nothing
// about the user is known yet.
//
// Deliberately small: this covers a sub-second gap in the common case, so
// it is a brand mark and a spinner, not a marketing splash. There is no
// percentage — none of the underlying work reports progress, and inventing
// one would be a fake.
//
// Replaces two separate inline spinners (RouteGuard's local `Splash` and
// app/index.tsx) that used a bare white background and announced nothing to
// a screen reader.
export function AuthBootstrapScreen() {
  return (
    <View
      style={styles.container}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={BOOTSTRAP_MESSAGE}
      accessibilityLiveRegion="polite"
    >
      <Text style={styles.brand}>NetFlow Edu</Text>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.message}>{BOOTSTRAP_MESSAGE}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  brand: {
    ...typography.label,
    color: colors.primary,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  message: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: "center",
  },
});
