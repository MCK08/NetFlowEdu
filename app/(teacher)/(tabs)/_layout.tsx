import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

import { ProfileTabButton } from "@features/authentication/components/ProfileTabButton";
import { colors } from "@theme/colors";
import { typography } from "@theme/typography";

// Mirrors (student)/(tabs)/_layout.tsx's structure — Phase 10 replaced the
// teacher's previous single-screen "just class creation" experience with
// the same three tabs the student side has.
//
// Phase 12E: the active tint moved from a hardcoded "black" to the brand
// primary, and inactive/label styling now comes from the design tokens.
// Deliberately scoped to THIS file — the student tab bar is a separate
// layout and is intentionally left untouched.
export default function TeacherTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarLabelStyle: typography.label,
        tabBarStyle: { borderTopColor: colors.divider },
      }}
    >
      <Tabs.Screen
        name="index"
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
