import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FormError } from "@components/ui/FormError";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { useAuth } from "@features/authentication";
import { useSignOut } from "@features/authentication/hooks/useSignOut";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

const GENERIC_MESSAGE =
  "Hesabınızla ilgili bir sorun oluştu. Lütfen daha sonra tekrar deneyin veya destek ekibiyle iletişime geçin.";

// Reached only when an authenticated, verified user's role doesn't match any
// known dashboard, or their profile document could not be read at all — e.g.
// a corrupted profile write, or a role removed server-side. Fails closed: no
// dashboard is guessed, and signing out is the only way forward.
export default function UnknownRoleScreen() {
  const { profileError } = useAuth();
  // Shared guarded sign-out: a failure here used to be an unhandled
  // rejection on the one screen whose ONLY action is signing out, leaving
  // the button looking inert with no way off the screen.
  const { signOut, isSigningOut, error } = useSignOut();

  return (
    <SafeAreaView style={styles.flex}>
      <View style={styles.content}>
        <View style={styles.icon}>
          <Ionicons name="alert-circle-outline" size={28} color={colors.danger} />
        </View>

        <Text style={styles.title}>Hesap Sorunu</Text>
        <Text style={styles.message}>{profileError ?? GENERIC_MESSAGE}</Text>

        <FormError message={error} />

        {/* No navigation after signing out — RouteGuard reacts to
            isAuthenticated becoming false and replaces the route to login
            itself. The previous router.replace("/") here raced it. */}
        <PrimaryButton label="Çıkış Yap" onPress={signOut} isLoading={isSigningOut} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.xl,
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.dangerMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...typography.displayLg,
    color: colors.textPrimary,
  },
  message: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
});
