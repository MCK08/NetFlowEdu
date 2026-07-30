import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

import { ProfileTabButton } from "@features/authentication/components/ProfileTabButton";

// Mirrors (student)/(tabs)/_layout.tsx's shape exactly — Phase 10 replaces
// the teacher's previous single-screen "just class creation" experience
// with the same three-tab structure the student side already has.
export default function TeacherTabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: "black" }}>
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
