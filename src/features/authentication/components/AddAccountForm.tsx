import { useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";

import { Divider } from "@components/ui/Divider";
import { FormError } from "@components/ui/FormError";
import { PasswordField } from "@components/ui/PasswordField";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { TextField } from "@components/ui/TextField";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";

import { GoogleSignInButton } from "./GoogleSignInButton";
import { useAddAccountForm } from "../hooks/useAddAccountForm";

interface AddAccountFormProps {
  // Prefilled when re-authenticating a specific stored account whose local
  // session expired — the address is already known, so re-typing it is
  // pointless friction. Empty for a plain "add another account".
  initialEmail?: string;
  title: string;
  description: string;
  onCancel: () => void;
  onAdded: () => void;
}

// Signing into an ADDITIONAL account, in place, without disturbing the one
// currently active.
//
// This is what "+ Başka Hesap Ekle" always should have done. It previously
// called router.push(ROUTES.login) while still signed in — and RouteGuard
// correctly bounces an authenticated user off the login screen straight
// back to their dashboard, so the button did nothing at all. The same dead
// end swallowed the expired-session recovery path.
//
// The credential exchange runs on the throwaway staging Auth instance (see
// AuthProvider.addAccountWithPassword -> multiAccountAuth), so a wrong
// password here can never sign the current account out. Nothing about the
// password is stored: it goes straight into Firebase Auth and the field is
// dropped when this unmounts.
export function AddAccountForm({
  initialEmail,
  title,
  description,
  onCancel,
  onAdded,
}: AddAccountFormProps) {
  const { input, setField, fieldErrors, formError, isSubmitting, submit, submitWithGoogle } =
    useAddAccountForm(initialEmail);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  async function handleSubmit() {
    if (await submit()) onAdded();
  }

  async function handleGoogleIdToken(idToken: string) {
    setGoogleError(null);
    // RouteGuard sends a brand-new Google account to onboarding on its own
    // (hasRequestedRole === false, see routing.ts) — this only has to close
    // the sheet.
    if (await submitWithGoogle(idToken)) onAdded();
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>

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
        submitBehavior="submit"
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

      <PrimaryButton label="Hesabı Ekle" onPress={handleSubmit} isLoading={isSubmitting} />

      <View style={styles.dividerRow}>
        <Divider style={styles.dividerLine} />
        <Text style={styles.dividerText}>veya</Text>
        <Divider style={styles.dividerLine} />
      </View>

      <GoogleSignInButton onIdToken={handleGoogleIdToken} onError={setGoogleError} />

      <PrimaryButton
        label="Vazgeç"
        onPress={onCancel}
        disabled={isSubmitting}
        variant="secondary"
      />
    </View>
  );
}

const styles = themedStyles(() => ({
  container: {
    gap: spacing.sm,
  },
  header: {
    gap: spacing.xxs,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  description: {
    ...typography.caption,
    color: colors.textSecondary,
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
}));
