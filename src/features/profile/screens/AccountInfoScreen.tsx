import { useState } from "react";
import { ScrollView, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppBackButton } from "@components/ui/AppBackButton";
import { Card } from "@components/ui/Card";
import { useAuth } from "@features/authentication";
import { GoogleSignInButton } from "@features/authentication/components/GoogleSignInButton";
import { colors } from "@theme/colors";
import { minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { typography } from "@theme/typography";

import { profileRoutesFor } from "../routes";

export const ACCOUNT_INFO_TITLE = "Hesap Bilgileri";

/** Past this OS text scale a label and its value stop sharing a row. Found
 *  on the simulator at the largest accessibility size: an e-mail beside its
 *  label had room for "stude…" and the Google answer for "H…", so the two
 *  facts on screen were the two nobody needed. Stacked, each gets the full
 *  width and wraps. */
const STACK_ABOVE_FONT_SCALE = 1.3;

// Phase 115 — the account facts, as their own screen.
//
// Nothing here is new: the e-mail, the number of accounts saved on this
// device, whether Google is linked, and the button that links it all sat in
// a card on Ayarlar itself (Phase 114, which had moved them off Profil).
// Ayarlar is now a list of destinations, so the facts moved one level down
// rather than being the one panel breaking that pattern.
//
// Deliberately NOT called "Şifre ve Güvenlik" or "Hesap Yönetimi": this app
// has no in-app password change, no session manager and no account
// deletion, and a heading that promises them would be a lie told by a
// title. It says what it holds.
export function AccountInfoScreen() {
  const { profile, knownAccounts, linkGoogleAccount, firebaseUser } = useAuth();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > STACK_ABOVE_FONT_SCALE;
  const [linkError, setLinkError] = useState<string | null>(null);

  const providerIds = firebaseUser?.providerData.map((provider) => provider.providerId) ?? [];
  const isGoogleLinked = providerIds.includes("google.com");
  const settingsHref = profileRoutesFor(profile?.role).settings as never;

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <AppBackButton fallbackHref={settingsHref} />
        <Text style={styles.headerTitle}>{ACCOUNT_INFO_TITLE}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card>
          <InfoRow label="E-posta" value={profile?.email ?? "—"} stacked={stacked} />
          <InfoRow label="Kayıtlı hesap" value={String(knownAccounts.length)} stacked={stacked} />
          <InfoRow label="Google bağlı" value={isGoogleLinked ? "Evet" : "Hayır"} stacked={stacked} />
        </Card>

        {!isGoogleLinked ? (
          <View style={styles.linkWrapper}>
            <GoogleSignInButton
              onIdToken={async (idToken) => {
                setLinkError(null);
                try {
                  await linkGoogleAccount(idToken);
                } catch (error) {
                  setLinkError(error instanceof Error ? error.message : "Google hesabı bağlanamadı.");
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
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value, stacked }: { label: string; value: string; stacked: boolean }) {
  return (
    <View style={[styles.infoRow, stacked ? styles.infoRowStacked : null]}>
      <Text style={styles.infoLabel}>{label}</Text>
      {/* Truncating is only acceptable while the value still has a row to
          itself to be truncated ON; stacked, it wraps in full. */}
      <Text style={[styles.infoValue, stacked ? styles.infoValueStacked : null]} numberOfLines={stacked ? undefined : 1}>
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
  headerSpacer: {
    width: minTouchTarget,
  },
  content: {
    padding: spacing.lg,
    paddingTop: spacing.xs,
    gap: spacing.md,
  },
  linkWrapper: {
    marginTop: spacing.xxs,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  infoRowStacked: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 2,
    paddingVertical: spacing.xs,
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
  infoValueStacked: {
    flexShrink: 0,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
  },
}));
