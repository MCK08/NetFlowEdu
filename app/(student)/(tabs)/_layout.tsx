import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

import { ProfileTabButton } from "@features/authentication/components/ProfileTabButton";
import { colors } from "@theme/colors";

export default function StudentTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
      }}
    >
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
