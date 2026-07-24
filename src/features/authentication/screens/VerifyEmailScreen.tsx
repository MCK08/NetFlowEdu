import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, Text } from "react-native";

import { FormError } from "@components/ui/FormError";
import { KeyboardSafeScreen } from "@components/ui/KeyboardSafeScreen";
import { PrimaryButton } from "@components/ui/PrimaryButton";

import { useEmailVerification } from "../hooks/useEmailVerification";

const TEACHER_REQUEST_PENDING_MESSAGE =
  "Öğretmen hesap talebiniz gönderildi.\nOnaylandıktan sonra hesabınız Öğretmen hesabına dönüştürülecek.";

export function VerifyEmailScreen() {
  const { teacherRequestPending } = useLocalSearchParams<{ teacherRequestPending?: string }>();
  const {
    email,
    isResending,
    isChecking,
    error,
    cooldownSeconds,
    resend,
    checkVerified,
    signOut,
  } = useEmailVerification();

  // Uses ONLY checkVerified()'s own return value, not the `isEmailVerified`
  // destructured above — that binding is fixed at this render, so by the
  // time the async checkVerified() call resolves (after it has just called
  // setEmailVerified(true) inside AuthProvider) it's already stale, and
  // `verified && isEmailVerified` would read the pre-tap `false` and never
  // navigate on the very first successful tap. checkVerified() already
  // implies "email is verified" — verifyAndCompleteOnboarding only
  // attempts completion after confirming that fresh, post-reload — so its
  // result alone is the correct, non-stale signal.
  async function handleCheck() {
    const onboardingCompleted = await checkVerified();
    if (onboardingCompleted) {
      router.replace("/");
    }
  }

  return (
    <KeyboardSafeScreen>
      <Text style={styles.title}>E-postanızı Doğrulayın</Text>
      <Text style={styles.subtitle}>
        {email
          ? `${email} adresine bir doğrulama bağlantısı gönderdik.`
          : "E-posta adresinize bir doğrulama bağlantısı gönderdik."}
      </Text>

      <FormError message={error} />

      {teacherRequestPending ? (
        <Text style={styles.teacherRequestText}>{TEACHER_REQUEST_PENDING_MESSAGE}</Text>
      ) : null}

      <PrimaryButton
        label="Doğruladım, tekrar kontrol et"
        onPress={handleCheck}
        isLoading={isChecking}
      />

      <PrimaryButton
        label={
          cooldownSeconds > 0
            ? `Doğrulama e-postasını yeniden gönder (${cooldownSeconds}s)`
            : "Doğrulama e-postasını yeniden gönder"
        }
        onPress={resend}
        isLoading={isResending}
        disabled={cooldownSeconds > 0}
        variant="secondary"
      />

      <PrimaryButton label="Çıkış Yap" onPress={signOut} variant="secondary" />
    </KeyboardSafeScreen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    opacity: 0.7,
    textAlign: "center",
    marginBottom: 8,
  },
  teacherRequestText: {
    backgroundColor: "#ECFDF3",
    color: "#027A48",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    textAlign: "center",
  },
});
