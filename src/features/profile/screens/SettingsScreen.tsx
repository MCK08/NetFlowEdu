import { router } from "expo-router";
import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppBackButton } from "@components/ui/AppBackButton";
import { useAuth } from "@features/authentication";
import { useSignOut } from "@features/authentication/hooks/useSignOut";
import { useGuidedTour } from "@features/onboarding";
import { useNavigationGuard } from "@hooks/useNavigationGuard";
import { colors } from "@theme/colors";
import { minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { typography } from "@theme/typography";

import { ProfileMenuGroup, ProfileMenuItem } from "../components/ProfileMenuGroup";
import { profileRoutesFor } from "../routes";

export const SETTINGS_TITLE = "Ayarlar";

// Phase 115 — Ayarlar as a list of destinations, grouped by subject.
//
// Phase 114 gave the gear a real screen by MOVING appearance, the tour
// replay, the account facts and Çıkış Yap off Profil. That fixed Profil and
// left Ayarlar as four unlike panels in a column: a segmented control, a
// row, an info card and a button. This phase gives them one shape —
// Hesap / Uygulama / Oturum, each a titled group of rows — and pushes the
// two that are really their own subject (appearance, account facts) into
// nested screens.
//
// WHAT IS DELIBERATELY ABSENT
//
// The approved mockup also drew Şifre ve Güvenlik, Bildirim Ayarları, Dil,
// Yardım Merkezi, Geri Bildirim and Uygulama Hakkında. The audit found no
// implementation behind any of them: password reset exists only as a
// PRE-LOGIN screen, notifications have an inbox but no preferences, there
// is no i18n runtime, and no support, feedback or about surface exists at
// all. Each would have had to be invented, so none is drawn. A settings row
// is a promise that something is there.
export function SettingsScreen() {
  const { profile } = useAuth();
  const { signOut, isSigningOut } = useSignOut();
  // Null only if this screen is ever rendered outside the root provider.
  const guidedTour = useGuidedTour();
  const guardedNavigate = useNavigationGuard();

  const routes = profileRoutesFor(profile?.role);

  const accountItems = useMemo<ProfileMenuItem[]>(
    () => [
      {
        key: "profile-details",
        icon: "person-outline",
        title: "Profil Bilgileri",
        description: "Ad, kullanıcı adı, profil fotoğrafı",
        onPress: () => guardedNavigate("edit-profile", () => router.push(routes.editProfile as never)),
      },
      {
        key: "account-info",
        icon: "shield-checkmark-outline",
        title: "Hesap Bilgileri",
        description: "E-posta ve bağlı hesaplar",
        onPress: () => guardedNavigate("account-info", () => router.push(routes.accountInfo as never)),
      },
    ],
    [guardedNavigate, routes.editProfile, routes.accountInfo],
  );

  const appItems = useMemo<ProfileMenuItem[]>(() => {
    const items: ProfileMenuItem[] = [
      {
        key: "appearance",
        icon: "color-palette-outline",
        title: "Görünüm",
        description: "Açık / Koyu / Sistemle aynı",
        onPress: () => guardedNavigate("appearance", () => router.push(routes.appearance as never)),
      },
    ];
    // Phase 74's only re-entry point into the guided tour. Hidden entirely
    // for a role with no authored tour rather than shown disabled — and it
    // stays, mockup or not, because it is real functionality with nowhere
    // else to live.
    if (guidedTour?.replayAudience) {
      items.push({
        key: "tour",
        icon: "information-circle-outline",
        title: "Uygulama Turunu Tekrar Gör",
        description: "NetFlowEdu'nun nasıl çalıştığını anlatan kısa tanıtım",
        onPress: guidedTour.replay,
        chevron: false,
      });
    }
    return items;
  }, [guardedNavigate, routes.appearance, guidedTour?.replayAudience, guidedTour?.replay]);

  const sessionItems = useMemo<ProfileMenuItem[]>(
    () => [
      {
        key: "sign-out",
        icon: "log-out-outline",
        title: "Çıkış Yap",
        description: isSigningOut ? "Çıkış yapılıyor…" : "Bu cihazdaki oturumu kapat",
        onPress: signOut,
        tone: "danger",
        // It ends a session rather than opening a screen, so no chevron
        // promises one.
        chevron: false,
        disabled: isSigningOut,
      },
    ],
    [signOut, isSigningOut],
  );

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <AppBackButton fallbackHref={routes.profileTab as never} />
        <Text style={styles.headerTitle}>{SETTINGS_TITLE}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ProfileMenuGroup title="Hesap" items={accountItems} />
        <ProfileMenuGroup title="Uygulama" items={appItems} />
        {/* Last and alone: the one action here that throws state away never
            sits beside a preference. */}
        <ProfileMenuGroup title="Oturum" items={sessionItems} />
      </ScrollView>
    </SafeAreaView>
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
    gap: spacing.lg,
  },
}));
