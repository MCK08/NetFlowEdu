import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

import { ProfileTabButton } from "@features/authentication/components/ProfileTabButton";
import { colors } from "@theme/colors";
import { typography } from "@theme/typography";
import { useThemeSubscription } from "@theme/ThemeProvider";

// Mirrors (student)/(tabs)/_layout.tsx's structure — Phase 10 replaced the
// teacher's previous single-screen "just class creation" experience with
// the same three tabs the student side has.
//
// Phase 12E: the active tint moved from a hardcoded "black" to the brand
// primary, and inactive/label styling now comes from the design tokens.
// Deliberately scoped to THIS file — the student tab bar is a separate
// layout and is intentionally left untouched.
export default function TeacherTabsLayout() {
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
        sceneStyle: { backgroundColor: colors.background },
        tabBarLabelStyle: typography.label,
        // backgroundColor added in Phase 49 — the pre-existing rule only set
        // borderTopColor, leaving the bar itself light under a dark app.
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.divider },
      }}
    >
      {/* Phase 50 — the launch feed takes index; the class list keeps its
          own tab immediately beside it, so nothing a teacher could reach
          before became harder to reach. */}
      <Tabs.Screen
        name="index"
        options={{
          title: "Akış",
          tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} />,
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
        name="friends"
        options={{
          title: "Arkadaşlar",
          tabBarIcon: ({ color, size }) => <Ionicons name="people" color={color} size={size} />,
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
