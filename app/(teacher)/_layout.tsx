import { Stack } from "expo-router";

export default function TeacherLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="class/[classId]/index" />
      <Stack.Screen name="class/[classId]/chat" />
    </Stack>
  );
}
