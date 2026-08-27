import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";

import { Divider } from "@components/ui/Divider";
import { FormError } from "@components/ui/FormError";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";

import { AuthShell } from "../components/AuthShell";
import { OnboardingProgress } from "../components/OnboardingProgress";
import { useEmailVerification } from "../hooks/useEmailVerification";
import { useOnboardingProgress } from "../hooks/useOnboardingProgress";

const TEACHER_REQUEST_PENDING_MESSAGE =
  "Öğretmen hesap talebiniz gönderildi.\nOnaylandıktan sonra hesabınız Öğretmen hesabına dönüştürülecek.";

const EMAIL_SEND_FAILED_MESSAGE =
  "Doğrulama e-postası gönderilemedi. Lütfen aşağıdaki butonla tekrar deneyin.";

export function VerifyEmailScreen() {
  const { teacherRequestPending, emailFailed } = useLocalSearchParams<{
    teacherRequestPending?: string;
    emailFailed?: string;
  }>();
  const {
    email,
    isResending,
    isChecking,
    isSigningOut,
    error,
    cooldownSeconds,
    resend,
    checkVerified,
    signOut,
  } = useEmailVerification();
  // Same indicator the register screen shows, one step further along — so
  // this screen reads as a stage of a flow rather than a dead end.
  const onboardingStep = useOnboardingProgress("password");

  // Uses ONLY checkVerified()'s own return value, not a destructured
  // `isEmailVerified` — that binding is fixed at this render, so by the
  // time the async call resolves it is already stale and the first
  // successful tap would never navigate.
  async function handleCheck() {
    const onboardingCompleted = await checkVerified();
    if (onboardingCompleted) {
      router.replace("/");
    }
  }

  return (
    <AuthShell
      title="E-postanı doğrula"
      description={
        emailFailed
          ? "Hesabın oluşturuldu ancak doğrulama e-postası gönderilemedi."
          : "Gönderdiğimiz bağlantıya dokunduktan sonra aşağıdaki butonla devam et."
      }
    >
      {onboardingStep ? <OnboardingProgress flow="password" currentStep={onboardingStep} /> : null}

      {/* The address is shown in its own panel rather than buried in the
          description — it is the one thing the reader needs to check
          against their inbox. */}
      {email ? (
        <View style={styles.emailPanel}>
          <Ionicons name="mail-outline" size={18} color={colors.primary} />
          <Text style={styles.emailText} numberOfLines={2}>
            {email}
          </Text>
        </View>
      ) : null}

      <FormError message={error ?? (emailFailed ? EMAIL_SEND_FAILED_MESSAGE : null)} />

      {teacherRequestPending ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{TEACHER_REQUEST_PENDING_MESSAGE}</Text>
        </View>
      ) : null}

      <PrimaryButton
        label="Doğruladım, tekrar kontrol et"
        onPress={handleCheck}
        isLoading={isChecking}
      />

      <PrimaryButton
        label={
          cooldownSeconds > 0
            ? `Yeniden gönder (${cooldownSeconds}s)`
            : "Doğrulama e-postasını yeniden gönder"
        }
        onPress={resend}
        isLoading={isResending}
        disabled={cooldownSeconds > 0}
        variant="secondary"
      />

      {/* Sign-out is an escape route, not a peer of the two actions above,
          so it sits below its own divider. */}
      <Divider style={styles.divider} />

      <PrimaryButton
        label="Çıkış Yap"
        onPress={signOut}
        isLoading={isSigningOut}
        variant="secondary"
      />
    </AuthShell>
  );
}

const styles = themedStyles(() => ({
  emailPanel: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  emailText: {
    ...typography.bodyStrong,
    color: colors.primary,
    flex: 1,
  },
  notice: {
    backgroundColor: colors.successMuted,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  noticeText: {
    ...typography.body,
    color: colors.success,
    textAlign: "center",
  },
  divider: {
    marginTop: spacing.xs,
  },
}));
