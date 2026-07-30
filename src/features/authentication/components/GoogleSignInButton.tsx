import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text } from "react-native";

import { isGoogleSignInConfigured, useGoogleIdTokenRequest } from "../services/googleAuth";

interface GoogleSignInButtonProps {
  onIdToken: (idToken: string) => Promise<void>;
  onError?: (message: string) => void;
  label?: string;
}

// Uses Firebase Authentication's own Google provider via expo-auth-session
// (browser-based OAuth, works inside Expo Go — no native module/rebuild).
// The caller decides what an obtained id_token actually DOES (fresh
// sign-in vs. add-another-account vs. link-to-current-account) — this
// component only gets the token.
export function GoogleSignInButton({ onIdToken, onError, label }: GoogleSignInButtonProps) {
  const [, , promptAsync] = useGoogleIdTokenRequest();
  const [isBusy, setIsBusy] = useState(false);
  // Read once per render rather than cached in state — matches
  // useGoogleIdTokenRequest's own reasoning that this value is fixed for
  // the app's lifetime (derived from process.env), so it never needs to
  // react to anything.
  const configured = isGoogleSignInConfigured();

  async function handlePress() {
    if (!configured) {
      // Visually "disabled" per spec, but the press must still be caught
      // here (a real RN `disabled` prop would swallow it silently) so the
      // user gets an explanation instead of a dead button.
      Alert.alert("Google Sign-In henüz yapılandırılmamış.");
      return;
    }
    setIsBusy(true);
    try {
      const result = await promptAsync();
      if (result.type !== "success") return;
      const idToken = result.params.id_token;
      if (!idToken) {
        onError?.("Google girişi tamamlanamadı. Lütfen tekrar deneyin.");
        return;
      }
      await onIdToken(idToken);
    } catch {
      onError?.("Google ile giriş yapılamadı. Lütfen tekrar deneyin.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={isBusy}
      style={[styles.button, isBusy || !configured ? styles.buttonDisabled : null]}
      accessibilityRole="button"
      accessibilityLabel="Google ile devam et"
      accessibilityState={{ disabled: !configured }}
    >
      {isBusy ? (
        <ActivityIndicator color="#1A1A1A" />
      ) : (
        <>
          <Ionicons name="logo-google" size={18} color="#1A1A1A" />
          <Text style={styles.text}>{label ?? "Google ile devam et"}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#D0D5DD",
    backgroundColor: "white",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  text: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1A1A1A",
  },
});
