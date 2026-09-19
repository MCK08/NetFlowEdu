import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

import { ProfileTabButton } from "@features/authentication/components/ProfileTabButton";
import { TeacherTodayProvider } from "@features/teacher/context/TeacherTodayContext";
import { colors } from "@theme/colors";
import { typography } from "@theme/typography";
import { useThemeSubscription } from "@theme/ThemeProvider";

// Phase 111 — the teacher's four places, by intent:
//
//   Bugün       what needs me today (lands here)
//   Sınıflar    every class, and each class's page
//   Aksiyonlar  the complete Action Center
//   Profil      who I am, my account, my friends
//
// Performance analytics stay where they answer a question — inside a class and
// a student — rather than becoming a fifth tab. The discovery feed and Friends
// left the bar but kept their routes: Bugün opens the feed, Profil opens
// Friends.
//
// TeacherTodayProvider sits above the tabs so Bugün and Aksiyonlar share ONE
// attention load for the selected class instead of each reading it.
//
// Phase 12E / 49 chrome is unchanged: brand-primary active tint, token label
// style, and a themed bar and scene so no light strip sits under a dark app.
export default function TeacherTabsLayout() {
  useThemeSubscription();
  return (
    <TeacherTodayProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textTertiary,
          sceneStyle: { backgroundColor: colors.background },
          tabBarLabelStyle: typography.label,
          tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.divider },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Bugün",
            tabBarIcon: ({ color, size }) => <Ionicons name="today" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="classes"
          options={{
            title: "Sınıflar",
            tabBarIcon: ({ color, size }) => <Ionicons name="school" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="actions"
          options={{
            title: "Aksiyonlar",
            tabBarIcon: ({ color, size }) => <Ionicons name="checkmark-done-circle" color={color} size={size} />,
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
    </TeacherTodayProvider>
  );
}
