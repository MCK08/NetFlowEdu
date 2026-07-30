import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { FormError } from "@components/ui/FormError";
import { KeyboardSafeScreen } from "@components/ui/KeyboardSafeScreen";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { TextField } from "@components/ui/TextField";

import { IntendedRole } from "../types";
import { useGoogleOnboardingForm } from "../hooks/useGoogleOnboardingForm";

interface GoogleOnboardingScreenProps {
  defaultDisplayName: string;
}

// Shown exactly once, right after a BRAND-NEW Google sign-up (see
// AuthProvider.addAccountWithGoogle's isNewUser result) — collects the two
// things a Google account doesn't already give this app: a chosen
// username and a role (student/teacher), the same two fields
// RegisterScreen collects, just without a password step.
export function GoogleOnboardingScreen({ defaultDisplayName }: GoogleOnboardingScreenProps) {
  const { input, setField, fieldErrors, formError, isSubmitting, submit } =
    useGoogleOnboardingForm(defaultDisplayName);

  async function handleSubmit() {
    const success = await submit();
    if (success) router.replace("/");
  }

  return (
    <KeyboardSafeScreen>
      <Text style={styles.title}>Hesabınızı tamamlayın</Text>
      <Text style={styles.subtitle}>Devam etmeden önce birkaç bilgiye ihtiyacımız var.</Text>

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

      <PrimaryButton label="Devam Et" onPress={handleSubmit} isLoading={isSubmitting} />
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
});
