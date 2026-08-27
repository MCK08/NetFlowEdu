import { Stack } from "expo-router";
import { useThemeSubscription } from "@theme/ThemeProvider";

export default function AuthLayout() {
  useThemeSubscription();
  return <Stack screenOptions={{ headerShown: false }} />;
}
