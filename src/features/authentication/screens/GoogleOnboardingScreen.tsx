import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useRef } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { Divider } from "@components/ui/Divider";
import { FormError } from "@components/ui/FormError";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { TextField } from "@components/ui/TextField";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

import { AuthShell } from "../components/AuthShell";
import { OnboardingProgress } from "../components/OnboardingProgress";
import { RoleSelector } from "../components/RoleSelector";
import { useGoogleOnboardingForm } from "../hooks/useGoogleOnboardingForm";
import { useOnboardingProgress } from "../hooks/useOnboardingProgress";
import { DISPLAY_NAME_HINT, USERNAME_HINT } from "../validation";

interface GoogleOnboardingScreenProps {
  defaultDisplayName: string;
  // The signed-in Google account's own address, straight off the Firebase
  // Auth user. Shown so it's obvious WHICH Google account is being set up —
  // nothing extra is requested from Google to display it.
  googleEmail?: string;
  // Escape hatch for "wrong Google account". Omitted when the host route
  // can't offer one.
  onSignOut?: () => void;
  isSigningOut?: boolean;
}

// Shown exactly once, right after a BRAND-NEW Google sign-up (see
// AuthProvider.addAccountWithGoogle's isNewUser result) — collects the two
// things a Google account doesn't already give this app: a chosen username
// and a role. A completed account can never land here: RouteGuard only
// resolves to this route while onboardingStatus is "pending" AND
// requestedRole is null (see routing.ts), both of which stop being true the
// moment initializeOnboarding succeeds.
export function GoogleOnboardingScreen({
  defaultDisplayName,
  googleEmail,
  onSignOut,
  isSigningOut,
}: GoogleOnboardingScreenProps) {
  const { input, setField, fieldErrors, formError, isSubmitting, submit } =
    useGoogleOnboardingForm(defaultDisplayName);
  const onboardingStep = useOnboardingProgress("google");
  const usernameRef = useRef<TextInput>(null);

  async function handleSubmit() {
    const success = await submit();
    // No manual routing on failure — a username conflict leaves the form
    // exactly as it is so the person can pick another and resubmit.
    if (success) router.replace("/");
  }

  return (
    <AuthShell
      title="Hesabını tamamla"
      description="Google hesabın doğrulandı. NetFlow Edu'da görünmen için bir kullanıcı adı ve hesap türü seçmen gerekiyor."
    >
      {onboardingStep ? <OnboardingProgress flow="google" currentStep={onboardingStep} /> : null}

      {googleEmail ? (
        <View style={styles.identity}>
          <Ionicons name="logo-google" size={16} color={colors.primary} />
          <Text style={styles.identityText} numberOfLines={2}>
            {googleEmail}
          </Text>
        </View>
      ) : null}

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
        <Text style={styles.sectionTitle}>Profil</Text>

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
          returnKeyType="go"
          onSubmitEditing={handleSubmit}
        />
      </View>

      <PrimaryButton label="Devam Et" onPress={handleSubmit} isLoading={isSubmitting} />

      {onSignOut ? (
        <>
          {/* Signing out is the only way back if the wrong Google account
              was picked — RouteGuard holds an incomplete account on this
              screen, so without it this would be a dead end. */}
          <Divider style={styles.divider} />
          <PrimaryButton
            label="Farklı bir hesap kullan"
            onPress={onSignOut}
            isLoading={isSigningOut}
            disabled={isSubmitting}
            variant="secondary"
          />
        </>
      ) : null}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  identityText: {
    ...typography.bodyStrong,
    color: colors.primary,
    flex: 1,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textTertiary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  divider: {
    marginTop: spacing.xxs,
  },
});
