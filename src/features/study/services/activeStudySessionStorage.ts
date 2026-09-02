import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  ACTIVE_STUDY_SESSION_STORAGE_KEY,
  ActiveStudySessionEnvelope,
  ActiveStudySessionMode,
} from "./activeStudySession";
import {
  isStudySessionStoreEmpty,
  parseStudySessionStore,
  putStudySessionSlot,
  removeStudySessionSlot,
  serializeStudySessionStore,
} from "./studySessionStore";

// Phase 67 — the only place AsyncStorage is touched for study sessions.
//
// Kept deliberately thin and free of parsing so the decision logic in
// activeStudySession.ts and studySessionStore.ts stays pure and directly
// unit-testable, which is how this repo already splits themeStorage from
// parseThemePreference.
//
// Every function swallows its own failure. A device with no writable
// container, a private browsing window, or cleared site data must never take
// down a study session: local persistence is a convenience for the closure
// summary, and the outcome itself is already safe on the server.
//
// The same package backs multi-account auth persistence on native and works on
// web via localStorage, so this adds no dependency and no platform split.
//
// Phase 69 — the API is now SLOT-level, and that is a correctness decision
// rather than a naming one.
//
// The old API took a whole envelope and wrote the whole key, so "save my
// session" and "delete the other mode's session" were the same call. Making
// the mode an explicit parameter and doing the merge HERE means no caller can
// disturb a mode it was not writing — the invariant is enforced by the only
// code that can violate it, not by every hook remembering to spread an object
// correctly.

/** Returns the raw stored string, or null when absent/unreadable.
 *  Raw on purpose — validation belongs to the pure parser. */
export async function loadActiveStudySessionRaw(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(ACTIVE_STUDY_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

// Serialises writes within this app instance.
//
// Every mutation is read-modify-write, so two of them interleaving at their
// awaits could have the second read a store that predates the first's write
// and then put the stale sibling back. Two hooks CAN be mounted at once (the
// study screen holds both), so this is reachable rather than theoretical.
//
// Deliberately a promise chain, not a cache: it holds no session data, so
// there is nothing here that could leak between users or survive as stale
// state. It also does not extend across browser tabs — see the phase doc's
// multi-tab limitation, which is documented rather than papered over.
let writeQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(operation, operation);
  // Swallow on the CHAIN only, so one failed write never rejects the next.
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Persists one mode's session, leaving the other mode's slot untouched.
 *
 *  Returns whether the write actually landed, so a caller can degrade
 *  knowingly rather than assume success — study itself never depends on the
 *  answer, and a failed local write is not a failed study outcome. */
export async function saveStudySessionSlot(
  envelope: ActiveStudySessionEnvelope,
): Promise<boolean> {
  return enqueue(async () => {
    try {
      // Re-read inside the write, never from a value the caller was holding:
      // the sibling slot may have changed since this hook last looked, and
      // writing a remembered copy of it would undo the other mode's progress.
      const raw = await AsyncStorage.getItem(ACTIVE_STUDY_SESSION_STORAGE_KEY);
      const next = putStudySessionSlot(parseStudySessionStore(raw), envelope);
      await AsyncStorage.setItem(
        ACTIVE_STUDY_SESSION_STORAGE_KEY,
        serializeStudySessionStore(next),
      );
      return true;
    } catch {
      return false;
    }
  });
}

/** Removes one mode's session, leaving the other mode's slot untouched.
 *
 *  Called when a completed session is acknowledged. Phase 68 removed the whole
 *  key here, which is exactly how acknowledging a finished review destroyed an
 *  adaptive session that was still in progress. */
export async function clearStudySessionSlot(mode: ActiveStudySessionMode): Promise<void> {
  await enqueue(async () => {
    try {
      const raw = await AsyncStorage.getItem(ACTIVE_STUDY_SESSION_STORAGE_KEY);
      const next = removeStudySessionSlot(parseStudySessionStore(raw), mode);
      // Nothing left to remember: drop the record rather than leaving an empty
      // shell behind.
      if (isStudySessionStoreEmpty(next)) {
        await AsyncStorage.removeItem(ACTIVE_STUDY_SESSION_STORAGE_KEY);
        return;
      }
      await AsyncStorage.setItem(
        ACTIVE_STUDY_SESSION_STORAGE_KEY,
        serializeStudySessionStore(next),
      );
    } catch {
      // Intentionally ignored — a stale slot is rejected on read anyway, by
      // the same user/mode/version checks that would have rejected it here.
    }
  });
}
