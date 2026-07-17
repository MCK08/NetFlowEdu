import { Link } from "expo-router";
import { StyleSheet, Text } from "react-native";

import { FormError } from "@components/ui/FormError";
import { KeyboardSafeScreen } from "@components/ui/KeyboardSafeScreen";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { TextField } from "@components/ui/TextField";
import { ROUTES } from "@constants/routes";

import { useForgotPasswordForm } from "../hooks/useForgotPasswordForm";

export function ForgotPasswordScreen() {
  const { input, setField, fieldErrors, isSubmitting, successMessage, submit } =
    useForgotPasswordForm();

  return (
    <KeyboardSafeScreen>
      <Text style={styles.title}>Şifremi Unuttum</Text>
      <Text style={styles.subtitle}>
        E-posta adresinizi girin, şifre sıfırlama bağlantısı gönderelim.
      </Text>

      {successMessage ? (
        <Text style={styles.successText}>{successMessage}</Text>
      ) : (
        <FormError message={null} />
      )}

      <TextField
        label="E-posta"
        value={input.email}
        onChangeText={(value) => setField("email", value)}
        errorMessage={fieldErrors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
      />

      <PrimaryButton label="Sıfırlama Bağlantısı Gönder" onPress={submit} isLoading={isSubmitting} />

      <Link href={ROUTES.login} style={styles.linkCenter}>
        Girişe dön
      </Link>
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
  successText: {
    backgroundColor: "#ECFDF3",
    color: "#027A48",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
  },
  linkCenter: {
    fontSize: 14,
    color: "#3358D9",
    fontWeight: "600",
    textAlign: "center",
    marginTop: 8,
  },
});
