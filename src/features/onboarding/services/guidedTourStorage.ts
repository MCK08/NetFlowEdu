import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  GUIDED_TOUR_STORAGE_KEY,
  GuidedTourAudience,
  GuidedTourRecord,
  parseGuidedTourRecord,
  serializeGuidedTourRecord,
  withGuidedTourCompleted,
  withGuidedTourReset,
} from "./guidedTour";

// Phase 74 — the only place AsyncStorage is touched for the guided tour.
//
// Kept free of parsing and of every decision, so guidedTour.ts stays pure and
// directly unit-testable. Same split as themeStorage/parseThemePreference and
// activeStudySessionStorage/activeStudySession.
//
// Every function swallows its own failure. A device with no writable
// container, a private browsing window or cleared site data must never take
// down the app on launch — this runs during the first render after routing
// settles. A failed read degrades to "show the tour", a failed write to "show
// it again next launch". Neither loses anything a user did.
//
// AsyncStorage already backs the theme preference and study-session
// continuity, and works on web via localStorage, so this adds no dependency
// and no platform split.

export async function loadGuidedTourRecord(): Promise<GuidedTourRecord> {
  try {
    return parseGuidedTourRecord(await AsyncStorage.getItem(GUIDED_TOUR_STORAGE_KEY));
  } catch {
    return parseGuidedTourRecord(null);
  }
}

// Serialises writes within this app instance.
//
// Both mutations below are read-modify-write, and the Profile replay row can
// fire one while the overlay's completion write is still in flight, so two of
// them interleaving at their awaits is reachable rather than theoretical. The
// same promise chain activeStudySessionStorage uses, for the same reason —
// and, as there, it holds no data, so nothing here can leak between accounts.
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

async function mutate(
  apply: (record: GuidedTourRecord) => GuidedTourRecord,
): Promise<void> {
  await enqueue(async () => {
    try {
      // Re-read inside the write rather than trusting a record the caller was
      // holding: another account's completion may have landed since, and
      // writing a remembered copy would drop it.
      const raw = await AsyncStorage.getItem(GUIDED_TOUR_STORAGE_KEY);
      const next = apply(parseGuidedTourRecord(raw));
      await AsyncStorage.setItem(GUIDED_TOUR_STORAGE_KEY, serializeGuidedTourRecord(next));
    } catch {
      // Intentionally ignored — see the module comment. Note this also covers
      // the unreadable-record case WITHOUT deleting anything: parse returns an
      // empty record, so a future version's data is replaced only by a
      // deliberate write from this build, never removed on sight.
    }
  });
}

/** Remembers that this account finished (or skipped) its tour. Skipping and
 *  completing record the same thing on purpose: both are the user saying they
 *  do not need the intro, and re-showing it to someone who skipped would make
 *  the skip button a lie. */
export async function saveGuidedTourCompleted(
  userId: string,
  audience: GuidedTourAudience,
): Promise<void> {
  await mutate((record) => withGuidedTourCompleted(record, userId, audience));
}

/** Forgets this account's completion so the tour can be replayed. */
export async function clearGuidedTourCompletion(
  userId: string,
  audience: GuidedTourAudience,
): Promise<void> {
  await mutate((record) => withGuidedTourReset(record, userId, audience));
}
