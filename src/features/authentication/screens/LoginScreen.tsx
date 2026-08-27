import { Link, router } from "expo-router";
import { useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";

import { Divider } from "@components/ui/Divider";
import { FormError } from "@components/ui/FormError";
import { PasswordField } from "@components/ui/PasswordField";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { TextField } from "@components/ui/TextField";
import { ROUTES } from "@constants/routes";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";
import { KnownAccount } from "@services/firebase/accountRegistry";

import { AuthShell } from "../components/AuthShell";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { RecentAccountsList } from "../components/RecentAccountsList";
import { SuspendedAccountError } from "../providers/AuthProvider";
import { ADD_ACCOUNT_SUSPENDED_MESSAGE, mapAuthErrorToMessage } from "../services/errorMapper";
import { useAuth } from "../hooks/useAuth";
import { useLoginForm } from "../hooks/useLoginForm";

export function LoginScreen() {
  const { input, setField, fieldErrors, formError, isSubmitting, submit } = useLoginForm();
  const { knownAccounts, switchAccount, addAccountWithGoogle } = useAuth();
  const [showRecentAccounts, setShowRecentAccounts] = useState(true);
  const [googleError, setGoogleError] = useState<string | null>(null);
  // Lets the email field's return key move focus to the password field
  // instead of dismissing the keyboard mid-form.
  const passwordRef = useRef<TextInput>(null);

  async function handleSubmit() {
    const success = await submit();
    if (success) {
      router.replace("/");
    }
  }

  async function handleContinueWithAccount(account: KnownAccount): Promise<boolean> {
    const success = await switchAccount(account.uid);
    if (success) {
      router.replace("/");
    }
    return success;
  }

  async function handleGoogleIdToken(idToken: string) {
    setGoogleError(null);
    try {
      const { isNewUser } = await addAccountWithGoogle(idToken);
      router.replace(isNewUser ? ROUTES.googleOnboarding : "/");
    } catch (error) {
      // addAccountWithGoogle now enforces the same suspended-account gate as
      // signIn (see AuthProvider), so it can reject after a technically
      // successful Google exchange. Previously any throw here escaped as an
      // unhandled rejection and the screen just sat there.
      setGoogleError(
        error instanceof SuspendedAccountError
          ? ADD_ACCOUNT_SUSPENDED_MESSAGE
          : mapAuthErrorToMessage(error),
      );
    }
  }

  const hasRecentAccounts = showRecentAccounts && knownAccounts.length > 0;

  return (
    <AuthShell
      title="Tekrar hoş geldin"
      description="Sınıflarına, sorularına ve arkadaşlarına devam etmek için giriş yap."
      footer={
        <Link href={ROUTES.register} style={styles.footerLink}>
          Hesabın yok mu? Kayıt ol
        </Link>
      }
    >
      {hasRecentAccounts ? (
        <RecentAccountsList
          accounts={knownAccounts}
          onContinue={handleContinueWithAccount}
          onUseAnotherAccount={() => setShowRecentAccounts(false)}
        />
      ) : null}

      <FormError message={formError ?? googleError} />

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
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />

      <PasswordField
        ref={passwordRef}
        label="Şifre"
        value={input.password}
        onChangeText={(value) => setField("password", value)}
        errorMessage={fieldErrors.password}
        autoComplete="password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={handleSubmit}
      />

      <Link href={ROUTES.forgotPassword} style={styles.forgotLink}>
        Şifremi unuttum
      </Link>

      <PrimaryButton label="Giriş Yap" onPress={handleSubmit} isLoading={isSubmitting} />

      <View style={styles.dividerRow}>
        <Divider style={styles.dividerLine} />
        <Text style={styles.dividerText}>veya</Text>
        <Divider style={styles.dividerLine} />
      </View>

      <GoogleSignInButton onIdToken={handleGoogleIdToken} onError={setGoogleError} />
    </AuthShell>
  );
}

const styles = themedStyles(() => ({
  forgotLink: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "600",
    alignSelf: "flex-end",
    // Keeps the tap area comfortable without making the link visually
    // compete with the primary button.
    paddingVertical: spacing.xxs,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  dividerLine: {
    flex: 1,
  },
  dividerText: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  footerLink: {
    ...typography.body,
    color: colors.primary,
    fontWeight: "600",
    textAlign: "center",
    paddingVertical: spacing.xs,
  },
}));
