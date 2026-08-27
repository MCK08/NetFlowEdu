import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { Text, View } from "react-native";

import { PrimaryButton } from "@components/ui/PrimaryButton";
import { TextField } from "@components/ui/TextField";
import { ROUTES } from "@constants/routes";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";

import { AuthShell } from "../components/AuthShell";
import { useForgotPasswordForm } from "../hooks/useForgotPasswordForm";

export function ForgotPasswordScreen() {
  const { input, setField, fieldErrors, isSubmitting, successMessage, submit } =
    useForgotPasswordForm();

  return (
    <AuthShell
      title="Şifreni sıfırla"
      description="E-posta adresini gir, şifre sıfırlama bağlantısını gönderelim."
      footer={
        <Link href={ROUTES.login} style={styles.footerLink}>
          Girişe dön
        </Link>
      }
    >
      {/* The success panel replaces the previous bare green Text AND the
          `<FormError message={null} />` no-op element that sat beside it. */}
      {successMessage ? (
        <View style={styles.success} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Ionicons name="mail-outline" size={18} color={colors.success} />
          <Text style={styles.successText}>{successMessage}</Text>
        </View>
      ) : null}

      <TextField
        label="E-posta"
        value={input.email}
        onChangeText={(value) => setField("email", value)}
        errorMessage={fieldErrors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="send"
        onSubmitEditing={submit}
      />

      <PrimaryButton
        label="Sıfırlama Bağlantısı Gönder"
        onPress={submit}
        isLoading={isSubmitting}
      />
    </AuthShell>
  );
}

const styles = themedStyles(() => ({
  success: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
    backgroundColor: colors.successMuted,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  successText: {
    ...typography.body,
    color: colors.success,
    flex: 1,
  },
  footerLink: {
    ...typography.body,
    color: colors.primary,
    fontWeight: "600",
    textAlign: "center",
    paddingVertical: spacing.xs,
  },
}));
