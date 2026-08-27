import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

import { ProfileTabButton } from "@features/authentication/components/ProfileTabButton";
import { colors } from "@theme/colors";
import { useThemeSubscription } from "@theme/ThemeProvider";

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
      {/* Phase 16 — the adaptive review queue. Placed second so the daily
          study session sits beside the feed rather than buried behind the
          profile; student-only by construction (this layout is the
          (student) group's, and recordStudyOutcome rejects non-students). */}
      <Tabs.Screen
        name="study"
        options={{
          title: "Çalış",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="library" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="classes"
        options={{
          title: "Sınıflarım",
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
