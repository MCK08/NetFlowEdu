import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

import { ProfileTabButton } from "@features/authentication/components/ProfileTabButton";
import { colors } from "@theme/colors";
import { useThemeSubscription } from "@theme/ThemeProvider";

// Phase 109 — exactly four student tabs: Akış, Çalış, Sınıf, Profil.
//
// Akış (index) is the landing tab and the question feed. Kişisel Analiz is
// no longer a tab: its summaries live inline in Çalış and Profil, and its
// deep readings remain reachable as nested routes under /(student)/analytics.
// The feed now follows the theme like every other tab, so the bar keeps one
// themed chrome throughout.
export default function StudentTabsLayout() {
  useThemeSubscription();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        // Phase 49 — without these the tab bar and the screen behind it keep
        // their default light chrome, which reads as a white strip under a
        // dark app.
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.divider },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Akış",
          tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} />,
        }}
      />
      {/* Phase 16 — the study workspace. Placed second so the day's work
          sits beside the feed; student-only by construction (this layout is
          the (student) group's, and recordStudyOutcome rejects non-students). */}
      <Tabs.Screen
        name="study"
        options={{
          title: "Çalış",
          tabBarIcon: ({ color, size }) => <Ionicons name="library" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="classes"
        options={{
          title: "Sınıf",
          tabBarIcon: ({ color, size }) => <Ionicons name="school" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} />,
          // A ~2s long-press opens the Account Switcher instead of
          // navigating — see ProfileTabButton's own doc comment.
          tabBarButton: ProfileTabButton,
        }}
      />
    </Tabs>
  );
}
