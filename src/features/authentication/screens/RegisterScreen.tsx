import { Link, router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Checkbox } from "@components/ui/Checkbox";
import { FormError } from "@components/ui/FormError";
import { KeyboardSafeScreen } from "@components/ui/KeyboardSafeScreen";
import { PasswordField } from "@components/ui/PasswordField";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { TextField } from "@components/ui/TextField";
import { ROUTES } from "@constants/routes";

import { IntendedRole } from "../types";
import { useRegisterForm } from "../hooks/useRegisterForm";

export function RegisterScreen() {
  const { input, setField, fieldErrors, formError, isSubmitting, submit } = useRegisterForm();

  async function handleSubmit() {
    const { success } = await submit();
    if (!success) return;

    router.replace(ROUTES.verifyEmail);
  }

  return (
    <KeyboardSafeScreen>
      <Text style={styles.title}>NetFlow Edu</Text>
      <Text style={styles.subtitle}>Hesap oluşturun</Text>

      <FormError message={formError} />

      <View style={styles.roleRow}>
        {(
          [
            { value: "student" as IntendedRole, label: "Öğrenciyim" },
            { value: "teacher" as IntendedRole, label: "Öğretmenim" },
          ] as const
        ).map((option) => {
          const selected = input.intendedRole === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => setField("intendedRole", option.value)}
              style={[styles.roleOption, selected ? styles.roleOptionSelected : null]}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
            >
              <Text style={[styles.roleOptionText, selected ? styles.roleOptionTextSelected : null]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <TextField
        label="Görünen Ad"
        value={input.displayName}
        onChangeText={(value) => setField("displayName", value)}
        errorMessage={fieldErrors.displayName}
        autoComplete="name"
        textContentType="name"
      />

      <TextField
        label="Kullanıcı Adı"
        value={input.username}
        onChangeText={(value) => setField("username", value)}
        errorMessage={fieldErrors.username}
        autoCapitalize="none"
        autoComplete="username"
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
  roleRow: {
    flexDirection: "row",
    gap: 10,
  },
  roleOption: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#8A8F98",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  roleOptionSelected: {
    backgroundColor: "#3358D9",
    borderColor: "#3358D9",
  },
  roleOptionText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1A1A1A",
  },
  roleOptionTextSelected: {
    color: "white",
  },
  linkCenter: {
    fontSize: 14,
    color: "#3358D9",
    fontWeight: "600",
    textAlign: "center",
    marginTop: 8,
  },
});
