// Phase 49 — device-local persistence for the appearance preference.
//
// AsyncStorage (not Firestore) on purpose: appearance is a property of the
// DEVICE, not of the account. Storing it server-side would mean a theme
// change costs a network write, cannot work logged out, and would fight
// itself on a shared device the moment two accounts disagree. It also keeps
// this phase free of any rules/schema change.
//
// The same package already backs multi-account auth persistence on native
// (accountPersistence.native.ts) and works on web via localStorage, so this
// introduces no new dependency and no new platform split.

import AsyncStorage from "@react-native-async-storage/async-storage";

import { DEFAULT_THEME_PREFERENCE, parseThemePreference, ThemePreference } from "./themePreference";

// Namespaced and version-stable. Bump the suffix only if the stored SHAPE
// ever changes — parseThemePreference already tolerates unknown values, so a
// rename is not needed just to add a new preference.
export const THEME_PREFERENCE_STORAGE_KEY = "netflowedu.theme.preference.v1";

// Never throws. Storage being unavailable (private browsing, cleared data, a
// simulator with no writable container) must degrade to the default rather
// than take the app down on launch — this runs before first paint.
export async function loadThemePreference(): Promise<ThemePreference> {
  try {
    const raw = await AsyncStorage.getItem(THEME_PREFERENCE_STORAGE_KEY);
    return parseThemePreference(raw);
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

// Fire-and-forget by design: the UI has already switched by the time this
// runs, and a failed write should not surface an error or roll the choice
// back — it just means the preference is not remembered next launch.
export async function saveThemePreference(preference: ThemePreference): Promise<void> {
  try {
    await AsyncStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, preference);
  } catch {
    // Intentionally ignored — see above.
  }
}
