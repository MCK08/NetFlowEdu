import { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

interface AuthShellProps {
  title: string;
  description?: string;
  children: ReactNode;
  // Rendered pinned under the form (register/login links, "girişe dön"),
  // so every auth screen puts its secondary navigation in the same place.
  footer?: ReactNode;
}

// The one layout every signed-out screen uses.
//
// Each auth screen previously re-declared its own `title`/`subtitle` styles
// with hardcoded font sizes and an `opacity: 0.7` subtitle — four
// near-identical copies that had already drifted (28pt on login, 24pt
// elsewhere). Sharing the shell is what makes login, register, verify-email
// and forgot-password read as one product.
//
// Keeps exactly ONE KeyboardAvoidingView and ONE ScrollView (the same
// structure KeyboardSafeScreen already used, which this replaces for auth
// screens) — nesting either is the classic source of "the submit button is
// under the keyboard" bugs. `maxWidth` keeps the form comfortable on a
// tablet without hardcoding any device height.
export function AuthShell({ title, description, children, footer }: AuthShellProps) {
  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.inner}>
            <View style={styles.header}>
              <Text style={styles.brand}>NetFlow Edu</Text>
              {/* Wraps rather than truncates: a screen title the reader
                  cannot finish is worse than one that takes two lines. */}
              <Text style={styles.title}>{title}</Text>
              {description ? <Text style={styles.description}>{description}</Text> : null}
            </View>

            <View style={styles.form}>{children}</View>

            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: spacing.xl,
  },
  inner: {
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xxs,
  },
  brand: {
    ...typography.label,
    color: colors.primary,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: {
    ...typography.displayLg,
    color: colors.textPrimary,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  form: {
    gap: spacing.md,
  },
  footer: {
    gap: spacing.sm,
    alignItems: "center",
  },
});
