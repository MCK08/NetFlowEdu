import { Link, router } from "expo-router";
import { StyleSheet, Text } from "react-native";

import { Checkbox } from "@components/ui/Checkbox";
import { FormError } from "@components/ui/FormError";
import { KeyboardSafeScreen } from "@components/ui/KeyboardSafeScreen";
import { PasswordField } from "@components/ui/PasswordField";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { TextField } from "@components/ui/TextField";
import { ROUTES } from "@constants/routes";

import { useRegisterForm } from "../hooks/useRegisterForm";

export function RegisterScreen() {
  const { input, setField, fieldErrors, formError, isSubmitting, submit } = useRegisterForm();

  async function handleSubmit() {
    const success = await submit();
    if (success) {
      router.replace(ROUTES.verifyEmail);
    }
  }

  return (
    <KeyboardSafeScreen>
      <Text style={styles.title}>NetFlow Edu</Text>
      <Text style={styles.subtitle}>Öğrenci hesabı oluşturun</Text>

      <FormError message={formError} />

      <TextField
        label="Ad Soyad"
        value={input.displayName}
        onChangeText={(value) => setField("displayName", value)}
        errorMessage={fieldErrors.displayName}
        autoComplete="name"
        textContentType="name"
      />

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

      <PasswordField
        label="Şifre"
        value={input.password}
        onChangeText={(value) => setField("password", value)}
        errorMessage={fieldErrors.password}
        autoComplete="password-new"
        textContentType="newPassword"
      />

      <PasswordField
        label="Şifre (Tekrar)"
        value={input.confirmPassword}
        onChangeText={(value) => setField("confirmPassword", value)}
        errorMessage={fieldErrors.confirmPassword}
        autoComplete="password-new"
        textContentType="newPassword"
      />

      <Checkbox
        label="Kullanım koşullarını kabul ediyorum"
        checked={input.acceptedTerms}
        onToggle={(value) => setField("acceptedTerms", value)}
        errorMessage={fieldErrors.acceptedTerms}
      />

      <PrimaryButton label="Kayıt Ol" onPress={handleSubmit} isLoading={isSubmitting} />

      <Link href={ROUTES.login} style={styles.linkCenter}>
        Zaten hesabınız var mı? Giriş yapın
      </Link>
    </KeyboardSafeScreen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    opacity: 0.7,
    textAlign: "center",
    marginBottom: 8,
  },
  linkCenter: {
    fontSize: 14,
    color: "#3358D9",
    fontWeight: "600",
    textAlign: "center",
    marginTop: 8,
  },
});
