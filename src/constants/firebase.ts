import Constants from "expo-constants";
import { Platform } from "react-native";

export const EMULATOR_PORTS = {
  auth: 9099,
  firestore: 8080,
  storage: 9199,
  functions: 5001,
} as const;

// Resolves the host the app should use to reach the local Firebase Emulator
// Suite. `localhost` only resolves to the machine running the emulators on
// iOS simulator and web; Android's emulator maps `10.0.2.2` to the host
// machine's `localhost`; a physical device on the same Wi-Fi network has no
// `localhost` shortcut at all, so we fall back to the LAN IP Expo's dev
// server already reports itself as running on (`hostUri`, e.g.
// "192.168.1.23:8081") and strip the port.
export function resolveEmulatorHost(): string {
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  const lanHost = hostUri?.split(":")[0];

  if (lanHost && lanHost !== "localhost" && lanHost !== "127.0.0.1") {
    return lanHost;
  }

  if (Platform.OS === "android") {
    return "10.0.2.2";
  }

  // Phase 55 — the IPv4 literal, deliberately NOT the string "localhost".
  //
  // The Firebase Emulator Suite binds IPv4 only (127.0.0.1), but iOS resolves
  // "localhost" to ::1 FIRST. Every emulator port is therefore refused over
  // IPv6 on the simulator — verified directly: curl to 127.0.0.1:{9099,8080,
  // 9199} answered while [::1] on the same ports was refused.
  //
  // Auth and Firestore hid this because their transports retry and fall back
  // to IPv4; a Storage upload does not, so answering a question from the
  // native app failed with "Görsel yüklenemedi" while the rest of the app
  // looked healthy. This is emulator-only code (useEmulators is false in
  // production, where there is no loopback host at all), so pinning the
  // family here removes the flakiness without touching production behaviour.
  return "127.0.0.1";
}
