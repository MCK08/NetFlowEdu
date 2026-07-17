import { Link, router } from "expo-router";
import { StyleSheet, Text } from "react-native";

import { FormError } from "@components/ui/FormError";
import { KeyboardSafeScreen } from "@components/ui/KeyboardSafeScreen";
import { PasswordField } from "@components/ui/PasswordField";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { TextField } from "@components/ui/TextField";
import { ROUTES } from "@constants/routes";

import { useLoginForm } from "../hooks/useLoginForm";

export function LoginScreen() {
  const { input, setField, fieldErrors, formError, isSubmitting, submit } = useLoginForm();

  async function handleSubmit() {
    const success = await submit();
    if (success) {
      router.replace("/");
    }
  }

  return (
    <KeyboardSafeScreen>
      <Text style={styles.title}>NetFlow Edu</Text>
      <Text style={styles.subtitle}>Hesabınıza giriş yapın</Text>

      <FormError message={formError} />

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
        autoComplete="password"
        textContentType="password"
      />

      <Link href={ROUTES.forgotPassword} style={styles.link}>
        Şifremi unuttum
      </Link>

      <PrimaryButton label="Giriş Yap" onPress={handleSubmit} isLoading={isSubmitting} />

      <Link href={ROUTES.register} style={styles.linkCenter}>
        Hesabınız yok mu? Kayıt olun
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
  link: {
    fontSize: 14,
    color: "#3358D9",
    fontWeight: "600",
    alignSelf: "flex-end",
  },
  linkCenter: {
    fontSize: 14,
    color: "#3358D9",
    fontWeight: "600",
    textAlign: "center",
    marginTop: 8,
  },
});
