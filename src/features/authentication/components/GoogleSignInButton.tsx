import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";

import { googleAvailability, useGoogleIdTokenRequest } from "../services/googleAuth";
import { GOOGLE_UNCONFIGURED_MESSAGE } from "../services/googleAuthAvailability";
import { GoogleFailureKind, mapGoogleFailureToMessage } from "../services/errorMapper";

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
//
// THE COMPONENT BOUNDARY: expo-auth-session's useIdTokenAuthRequest throws
// synchronously during render when the current platform's client id is
// missing. Previously that was guarded by an `if` inside the hook itself,
// which is an illegal conditional hook (and needed two
// `eslint-disable react-hooks/rules-of-hooks` comments to compile). Now the
// unconfigured environment renders a DIFFERENT component that never calls
// the hook at all, so the hook below is unconditional and the lint rule
// stays armed for any future, genuinely dynamic condition.
export function GoogleSignInButton(props: GoogleSignInButtonProps) {
  // Bundle-time constant (reads process.env), so this branch is stable for
  // the app's whole lifetime — but it now selects a COMPONENT, not whether
  // a hook runs.
  const availability = googleAvailability();

  if (availability.status !== "available") {
    return <GoogleUnavailableNotice />;
  }
  return <GoogleSignInButtonConfigured {...props} />;
}

// Shown instead of a dead button. The previous version rendered a
// tappable-looking button that only explained itself in an Alert AFTER
// being pressed; stating it up front is both clearer and one less dead end.
// Never names or echoes a client id — that is configuration, not something
// a user can act on.
function GoogleUnavailableNotice() {
  return (
    <View style={styles.notice} accessible accessibilityLabel={GOOGLE_UNCONFIGURED_MESSAGE}>
      <Ionicons name="information-circle-outline" size={16} color={colors.textTertiary} />
      <Text style={styles.noticeText}>{GOOGLE_UNCONFIGURED_MESSAGE}</Text>
    </View>
  );
}

function GoogleSignInButtonConfigured({ onIdToken, onError, label }: GoogleSignInButtonProps) {
  const [, , promptAsync] = useGoogleIdTokenRequest();
  const [isBusy, setIsBusy] = useState(false);

  // Every outcome goes through the shared taxonomy, which is what keeps a
  // CANCELLATION (message `null`) from being reported as a failure — the
  // messages used to be bare literals here, where nothing could assert that.
  function report(kind: GoogleFailureKind) {
    const message = mapGoogleFailureToMessage(kind);
    if (message !== null) onError?.(message);
  }

  async function handlePress() {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const result = await promptAsync();
      // A dismissed/cancelled browser sheet is a normal user choice, not a
      // failure — it must never surface as an error message.
      if (result.type !== "success") {
        report("cancelled");
        return;
      }
      const idToken = result.params.id_token;
      if (!idToken) {
        report("missing_token");
        return;
      }
      await onIdToken(idToken);
    } catch {
      report("exchange_failed");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <AnimatedPressable
      onPress={handlePress}
      disabled={isBusy}
      style={styles.button}
      accessibilityRole="button"
      accessibilityLabel={label ?? "Google ile devam et"}
      accessibilityState={{ disabled: isBusy, busy: isBusy }}
    >
      {/* The label stays mounted while busy so the button cannot resize
          mid-request. */}
      <View style={[styles.buttonContent, isBusy ? styles.hidden : null]}>
        <Ionicons name="logo-google" size={18} color={colors.textPrimary} />
        <Text style={styles.text}>{label ?? "Google ile devam et"}</Text>
      </View>
      {isBusy ? (
        <View style={styles.spinnerOverlay} pointerEvents="none">
          <ActivityIndicator color={colors.textPrimary} />
        </View>
      ) : null}
    </AnimatedPressable>
  );
}

const styles = themedStyles(() => ({
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  hidden: {
    opacity: 0,
  },
  spinnerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  noticeText: {
    ...typography.caption,
    color: colors.textTertiary,
    flex: 1,
  },
}));
