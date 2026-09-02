import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  ACTIVE_STUDY_SESSION_STORAGE_KEY,
  ActiveStudySessionEnvelope,
  serializeActiveStudySession,
} from "./activeStudySession";

// Phase 67 — the only place AsyncStorage is touched for the active session.
//
// Kept deliberately thin and free of parsing so the decision logic in
// activeStudySession.ts stays pure and directly unit-testable, which is how
// this repo already splits themeStorage from parseThemePreference.
//
// Every function swallows its own failure. A device with no writable
// container, a private browsing window, or cleared site data must never take
// down a study session: local persistence is a convenience for the closure
// summary, and the outcome itself is already safe on the server.
//
// The same package backs multi-account auth persistence on native and works on
// web via localStorage, so this adds no dependency and no platform split.

/** Returns the raw stored string, or null when absent/unreadable.
 *  Raw on purpose — validation belongs to the pure parser. */
export async function loadActiveStudySessionRaw(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(ACTIVE_STUDY_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Persists the active session. Returns whether the write actually landed, so
 *  a caller can degrade knowingly rather than assume success — study itself
 *  never depends on the answer. */
export async function saveActiveStudySession(
  envelope: ActiveStudySessionEnvelope,
): Promise<boolean> {
  try {
    await AsyncStorage.setItem(
      ACTIVE_STUDY_SESSION_STORAGE_KEY,
      serializeActiveStudySession(envelope),
    );
    return true;
  } catch {
    return false;
  }
}

/** Removes the active session record. Called when a session completes, and
 *  when a persisted session turns out to belong to someone else. */
export async function clearActiveStudySession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ACTIVE_STUDY_SESSION_STORAGE_KEY);
  } catch {
    // Intentionally ignored — a stale record is rejected on read anyway, by
    // the same user/mode/version checks that would have rejected it here.
  }
}
