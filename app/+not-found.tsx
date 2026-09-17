import { useRouter } from "expo-router";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@components/ui/EmptyState";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";

// Phase 105 — the production fallback for a URL that matches no route.
//
// Without this file expo-router renders its OWN built-in unmatched screen,
// and it does so in RELEASE builds too: verified on a Release simulator
// build, where `netflowedu://this/route/does/not/exist` produced an English
// "Unmatched Route / Page could not be found." screen showing the raw URL
// and a "Sitemap" link listing every route in the app. That is developer
// tooling, not a user-facing state — untranslated in a Turkish app, and it
// discloses the whole navigation tree to anyone who opens a stale or
// mistyped link.
//
// A terminal fallback with one recovery action, deliberately shaped like
// unknown-role.tsx (the app's other terminal state) rather than like a
// pushed screen: there is no canonical parent to put behind a back chevron,
// because the URL that landed here never resolved to a place in the tree.
// Recovery goes through "/" so RouteGuard — the single authority on which
// group an auth state belongs in — picks the destination for a signed-out
// visitor, a student and a teacher alike.
export default function NotFoundRoute() {
  useThemeSubscription();
  const router = useRouter();

  return (
    <SafeAreaView style={styles.flex}>
      <View style={styles.content}>
        <EmptyState
          icon="compass-outline"
          title="Sayfa bulunamadı"
          description="Bu bağlantı artık geçerli değil ya da taşınmış olabilir."
        />
        <PrimaryButton label="Ana sayfaya dön" onPress={() => router.replace("/")} />
      </View>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
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
}));
