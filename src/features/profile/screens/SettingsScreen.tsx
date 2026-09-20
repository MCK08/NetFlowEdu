import { Ionicons } from "@expo/vector-icons";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState } from "react";

import { AppBackButton } from "@components/ui/AppBackButton";
import { Card } from "@components/ui/Card";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { SectionHeader } from "@components/ui/SectionHeader";
import { useAuth } from "@features/authentication";
import { GoogleSignInButton } from "@features/authentication/components/GoogleSignInButton";
import { useSignOut } from "@features/authentication/hooks/useSignOut";
import { useGuidedTour } from "@features/onboarding";
import { AppearanceSelector } from "@theme/AppearanceSelector";
import { colors } from "@theme/colors";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { typography } from "@theme/typography";
import { Pressable } from "react-native";

import { profileRoutesFor } from "../routes";

export const SETTINGS_TITLE = "Ayarlar";

// Phase 114 — the destination behind Profil's gear.
//
// Nothing here is new. Appearance, the guided-tour replay, the account
// facts and Çıkış Yap all previously sat on Profil itself, each in its own
// card, which is what made that screen read as a settings page with a
// profile at the top. They MOVED here rather than being duplicated: Profil
// keeps identity, learning and navigation; this keeps device and account
// preferences.
//
// Shared by both roles, exactly as ProfileScreen is — the only role-specific
// thing is which edit-profile route "Hesap ve Profil" belongs to, and
// neither role gets a control the other does not.
export function SettingsScreen() {
  const { profile, knownAccounts, linkGoogleAccount, firebaseUser } = useAuth();
  const { signOut, isSigningOut } = useSignOut();
  // Null only if this screen is ever rendered outside the root provider.
  const guidedTour = useGuidedTour();
  const [linkError, setLinkError] = useState<string | null>(null);

  const providerIds = firebaseUser?.providerData.map((provider) => provider.providerId) ?? [];
  const isGoogleLinked = providerIds.includes("google.com");
  const routes = profileRoutesFor(profile?.role);

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <AppBackButton fallbackHref={routes.settings === "/(teacher)/settings" ? "/(teacher)/(tabs)/profile" : "/(student)/(tabs)/profile"} />
        <Text style={styles.headerTitle}>{SETTINGS_TITLE}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <AppearanceSelector />

        {/* Phase 74's only re-entry point into the guided tour. Hidden
            entirely for a role with no authored tour, rather than shown
            disabled. */}
        {guidedTour?.replayAudience ? (
          <Card>
            <Pressable
              onPress={guidedTour.replay}
              style={styles.tourRow}
              accessibilityRole="button"
              accessibilityLabel="Tanıtımı tekrar gör"
              accessibilityHint="NetFlowEdu tanıtımını yeniden açar"
            >
              <Ionicons
                name="information-circle-outline"
                size={iconSize.md}
                color={colors.primary}
                accessibilityElementsHidden
              />
              <View style={styles.tourCopy}>
                <Text style={styles.tourTitle}>Tanıtımı Tekrar Gör</Text>
                <Text style={styles.tourDetail}>
                  NetFlowEdu&apos;nun nasıl çalıştığını anlatan kısa tanıtım.
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={iconSize.sm}
                color={colors.textTertiary}
                accessibilityElementsHidden
              />
            </Pressable>
          </Card>
        ) : null}

        <Card>
          <SectionHeader title="Hesap" />
          <InfoRow label="E-posta" value={profile?.email ?? "—"} />
          <InfoRow label="Kayıtlı hesap" value={String(knownAccounts.length)} />
          <InfoRow label="Google bağlı" value={isGoogleLinked ? "Evet" : "Hayır"} />
          {!isGoogleLinked ? (
            <View style={styles.linkButtonWrapper}>
              <GoogleSignInButton
                onIdToken={async (idToken) => {
                  setLinkError(null);
                  try {
                    await linkGoogleAccount(idToken);
                  } catch (error) {
                    setLinkError(
                      error instanceof Error ? error.message : "Google hesabı bağlanamadı.",
                    );
                  }
                }}
                onError={setLinkError}
                label="Google Hesabını Bağla"
              />
            </View>
          ) : null}
          {linkError ? (
            <Text style={styles.errorText} accessibilityRole="alert">
              {linkError}
            </Text>
          ) : null}
        </Card>

        {/* Session end, last and alone: it is the one action here that
            throws away state, so it never sits beside a preference. */}
        <View style={styles.signOutWrapper}>
          <PrimaryButton
            label="Çıkış Yap"
            onPress={signOut}
            variant="secondary"
            isLoading={isSigningOut}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = themedStyles(() => ({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  headerTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
    flex: 1,
    textAlign: "center",
  },
  // Balances the back button so the title stays optically centred.
  headerSpacer: {
    width: minTouchTarget,
  },
  content: {
    padding: spacing.lg,
    paddingTop: spacing.xs,
    gap: spacing.md,
  },
  tourRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    minHeight: minTouchTarget,
  },
  tourCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  tourTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  tourDetail: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  linkButtonWrapper: {
    marginTop: spacing.xs,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 2,
  },
  infoLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  infoValue: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.xxs,
  },
  signOutWrapper: {
    marginTop: spacing.sm,
  },
}));
