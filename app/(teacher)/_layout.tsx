import { Stack } from "expo-router";

// Phase 10: the teacher area gained tabs (Sınıflarım/Arkadaşlar/Profil),
// mirroring (student)/_layout.tsx's own Stack-wraps-(tabs)-plus-siblings
// shape exactly — class/[classId]/* stay untouched, non-tab stack screens.
export default function TeacherLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="class/[classId]/index" />
      <Stack.Screen name="class/[classId]/chat" />
      <Stack.Screen name="user/[userId]" />
      <Stack.Screen name="find-friends" />
      <Stack.Screen name="edit-profile" options={{ presentation: "modal" }} />
    </Stack>
  );
}
