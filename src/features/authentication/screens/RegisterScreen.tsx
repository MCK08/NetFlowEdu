import { Link, router } from "expo-router";
import { useRef } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { Checkbox } from "@components/ui/Checkbox";
import { FormError } from "@components/ui/FormError";
import { PasswordField } from "@components/ui/PasswordField";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { TextField } from "@components/ui/TextField";
import { ROUTES } from "@constants/routes";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

import { AuthShell } from "../components/AuthShell";
import { OnboardingProgress } from "../components/OnboardingProgress";
import { PasswordRequirements } from "../components/PasswordRequirements";
import { RoleSelector } from "../components/RoleSelector";
import { useOnboardingProgress } from "../hooks/useOnboardingProgress";
import { useRegisterForm } from "../hooks/useRegisterForm";
import { DISPLAY_NAME_HINT, USERNAME_HINT } from "../validation";

export function RegisterScreen() {
  const { input, setField, fieldErrors, formError, isSubmitting, submit } = useRegisterForm();
  const onboardingStep = useOnboardingProgress("password");

  // Return-key focus chain: display name -> username -> email -> password ->
  // confirm -> submit. Without these the keyboard closed after every field
  // on a six-field form.
  const usernameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  async function handleSubmit() {
    const { success, verificationEmailSent } = await submit();
    if (!success) return;

    router.replace({
      pathname: ROUTES.verifyEmail,
      params: verificationEmailSent === false ? { emailFailed: "1" } : {},
    });
  }

  return (
    <AuthShell
      title="Hesabını oluştur"
      description="Birkaç bilgi yeterli. E-postanı doğruladıktan sonra hesabın hazır."
      footer={
        <Link href={ROUTES.login} style={styles.footerLink}>
          Zaten hesabın var mı? Giriş yap
        </Link>
      }
    >
      {/* Derived from the live auth/profile state, never hardcoded — and
          null (nothing rendered) for an account the server already
          considers finished. */}
      {onboardingStep ? <OnboardingProgress flow="password" currentStep={onboardingStep} /> : null}

      <FormError message={formError} />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Hesap türü</Text>
        <RoleSelector
          value={input.intendedRole}
          onChange={(role) => setField("intendedRole", role)}
          disabled={isSubmitting}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Kimlik</Text>

        <TextField
          label="Görünen Ad"
          hint={DISPLAY_NAME_HINT}
          value={input.displayName}
          onChangeText={(value) => setField("displayName", value)}
          errorMessage={fieldErrors.displayName}
          autoComplete="name"
          textContentType="name"
          returnKeyType="next"
          onSubmitEditing={() => usernameRef.current?.focus()}
          submitBehavior="submit"
        />

        <TextField
          ref={usernameRef}
          label="Kullanıcı Adı"
          hint={USERNAME_HINT}
          value={input.username}
          onChangeText={(value) => setField("username", value)}
          errorMessage={fieldErrors.username}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
          submitBehavior="submit"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Giriş bilgileri</Text>

        <TextField
          ref={emailRef}
          label="E-posta"
          value={input.email}
          onChangeText={(value) => setField("email", value)}
          errorMessage={fieldErrors.email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          submitBehavior="submit"
        />

        <PasswordField
          ref={passwordRef}
          label="Şifre"
          value={input.password}
          onChangeText={(value) => setField("password", value)}
          errorMessage={fieldErrors.password}
          autoComplete="password-new"
          textContentType="newPassword"
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
          submitBehavior="submit"
        />

        <PasswordRequirements password={input.password} />

        <PasswordField
          ref={confirmRef}
          label="Şifre (Tekrar)"
          value={input.confirmPassword}
          onChangeText={(value) => setField("confirmPassword", value)}
          errorMessage={fieldErrors.confirmPassword}
          autoComplete="password-new"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={handleSubmit}
        />
      </View>

      <Checkbox
        label="Kullanım koşullarını kabul ediyorum"
        checked={input.acceptedTerms}
        onToggle={(value) => setField("acceptedTerms", value)}
        errorMessage={fieldErrors.acceptedTerms}
      />

      <PrimaryButton label="Kayıt Ol" onPress={handleSubmit} isLoading={isSubmitting} />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textTertiary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  footerLink: {
    ...typography.body,
    color: colors.primary,
    fontWeight: "600",
    textAlign: "center",
    paddingVertical: spacing.xs,
  },
});
