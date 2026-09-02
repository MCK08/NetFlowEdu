import {
  ACTIVE_STUDY_SESSION_MODES,
  ActiveStudySessionEnvelope,
  ActiveStudySessionMode,
  isActiveStudySessionMode,
  normalizePlannedQuestionIds,
  parseLegacyActiveStudySession,
  parseSessionReceipts,
} from "./activeStudySession";

// Phase 69 — the bounded container that lets Review and Adaptive be in
// progress at the same time.
//
// WHAT WAS ACTUALLY WRONG BEFORE
//
// Phases 67/68 persisted ONE envelope under one key, and both hooks wrote it
// whole. The overwrite did not happen on mount (a mount only reads) — it
// happened on the first CONFIRMED OUTCOME in the other mode, on that mode's
// completion stamp, and on its acknowledge, which called removeItem on the one
// shared key. So:
//
//   adaptive 1/4 → open Review → answer one review card
//   → the adaptive envelope is gone: no session id, no receipts, no frozen
//     plan, and the next visit silently starts a brand new adaptive session.
//
// Proven against the real functions before this file existed.
//
// WHAT THIS IS NOT
//
// Not session history. There is no array of sessions, no archive, no
// "recent sessions", no timeline. The store holds AT MOST ONE slot per mode —
// two slots total — and a slot is replaced, never appended to. That bound is
// structural: `slots` is keyed by mode, so it cannot grow a third entry.
//
// THE INVARIANT EVERYTHING HERE EXISTS TO ENFORCE
//
// Writing one mode must never disturb the other. That is why the store is a
// value with explicit put/remove operations rather than something each hook
// assembles by spreading an object it happens to be holding: a hook that
// forgets to spread would silently delete the sibling session, and the bug
// would look exactly like the one this phase fixes.

export const STUDY_SESSION_STORE_VERSION = 3;

/** At most one slot per mode. Absent means "no session for this mode". */
export interface StudySessionStore {
  version: number;
  slots: Partial<Record<ActiveStudySessionMode, ActiveStudySessionEnvelope>>;
}

export const EMPTY_STUDY_SESSION_STORE: StudySessionStore = Object.freeze({
  version: STUDY_SESSION_STORE_VERSION,
  slots: Object.freeze({}) as StudySessionStore["slots"],
});

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** One slot, validated field by field.
 *
 *  Returns null for anything it cannot fully vouch for. The caller drops just
 *  that slot, so a corrupted Review slot never takes a valid Adaptive session
 *  down with it — one mode's bad bytes are not evidence about the other. */
function parseSlot(value: unknown, mode: ActiveStudySessionMode): ActiveStudySessionEnvelope | null {
  if (!isPlainObject(value)) return null;

  const sessionInstanceId = asString(value.sessionInstanceId);
  const userId = asString(value.userId);
  if (!sessionInstanceId || !userId) return null;
  // The slot's own mode must agree with the key it was filed under. A record
  // claiming otherwise is not repaired into one or the other — that guess
  // could move a session's evidence between modes, which is exactly the
  // leakage the mode scope exists to prevent.
  if (value.mode !== undefined && value.mode !== mode) return null;
  if (typeof value.startedAt !== "number" || !Number.isFinite(value.startedAt)) return null;
  if (!Array.isArray(value.receipts)) return null;

  const completedAt =
    typeof value.completedAt === "number" && Number.isFinite(value.completedAt)
      ? value.completedAt
      : null;

  return {
    version: STUDY_SESSION_STORE_VERSION,
    sessionInstanceId,
    userId,
    mode,
    startedAt: value.startedAt,
    receipts: parseSessionReceipts(value.receipts),
    plannedQuestionIds: normalizePlannedQuestionIds(value.plannedQuestionIds),
    completedAt,
  };
}

/** Parses the stored record into the canonical store, migrating older shapes.
 *
 *  Total: never throws, and returns an empty store rather than null for
 *  anything unreadable. "No slots" and "unreadable" behave identically at
 *  every call site — both mean the caller starts a fresh session — so
 *  collapsing them removes a null check that could only ever be got wrong.
 *
 *  MIGRATION (§23): a valid Phase 67 (v1) or Phase 68 (v2) single-session
 *  record is not discarded merely because the local schema moved on. It is a
 *  real session someone is in the middle of, so it is filed into the slot for
 *  the mode it already declared. The legacy parser is reused rather than
 *  re-implemented, so migration and the original format cannot drift. */
export function parseStudySessionStore(raw: string | null): StudySessionStore {
  if (!raw) return EMPTY_STUDY_SESSION_STORE;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_STUDY_SESSION_STORE;
  }
  if (!isPlainObject(parsed)) return EMPTY_STUDY_SESSION_STORE;

  if (parsed.version === STUDY_SESSION_STORE_VERSION) {
    if (!isPlainObject(parsed.slots)) return EMPTY_STUDY_SESSION_STORE;
    const slots: StudySessionStore["slots"] = {};
    // Iterating the KNOWN modes, never the stored object's own keys, is what
    // stops a malformed record inventing a third slot (§76) — an unrecognised
    // key is simply never looked at.
    for (const mode of ACTIVE_STUDY_SESSION_MODES) {
      const slot = parseSlot((parsed.slots as Record<string, unknown>)[mode], mode);
      if (slot) slots[mode] = slot;
    }
    return { version: STUDY_SESSION_STORE_VERSION, slots };
  }

  const legacy = parseLegacyActiveStudySession(parsed);
  if (!legacy) return EMPTY_STUDY_SESSION_STORE;
  return { version: STUDY_SESSION_STORE_VERSION, slots: { [legacy.mode]: legacy } };
}

/** Serialises the store, writing ONLY the declared fields.
 *
 *  Nothing question-shaped is persisted: no question text, no image urls, no
 *  answer choices, no teacher content, no student name, no queue snapshot and
 *  no Firestore cursor. subject/topic are carried because the reflection needs
 *  them after a restart, once the answered item has left the due query — short
 *  learning metadata the session already held in memory, not content. */
export function serializeStudySessionStore(store: StudySessionStore): string {
  const slots: Record<string, unknown> = {};
  for (const mode of ACTIVE_STUDY_SESSION_MODES) {
    const slot = store.slots[mode];
    if (!slot) continue;
    slots[mode] = {
      sessionInstanceId: slot.sessionInstanceId,
      userId: slot.userId,
      mode: slot.mode,
      startedAt: slot.startedAt,
      receipts: slot.receipts.map((receipt) => ({
        operationId: receipt.operationId,
        questionId: receipt.questionId,
        subject: receipt.subject,
        topic: receipt.topic,
        outcome: receipt.outcome,
      })),
      plannedQuestionIds: [...slot.plannedQuestionIds],
      completedAt: slot.completedAt,
    };
  }
  return JSON.stringify({ version: STUDY_SESSION_STORE_VERSION, slots });
}

/** The session stored for one mode, or null. */
export function readStudySessionSlot(
  store: StudySessionStore,
  mode: ActiveStudySessionMode,
): ActiveStudySessionEnvelope | null {
  return store.slots[mode] ?? null;
}

/** Replaces ONE mode's slot, leaving every other slot byte-identical.
 *
 *  The sibling is carried by reference, not rebuilt, so there is no field list
 *  to keep in sync and no way for a future field to be silently dropped from
 *  the mode that was not being written. */
export function putStudySessionSlot(
  store: StudySessionStore,
  envelope: ActiveStudySessionEnvelope,
): StudySessionStore {
  return {
    version: STUDY_SESSION_STORE_VERSION,
    slots: { ...store.slots, [envelope.mode]: envelope },
  };
}

/** Removes ONE mode's slot, leaving every other slot byte-identical.
 *
 *  This is what acknowledging a completed session does. Phase 68 removed the
 *  whole storage key at that point, which is precisely how finishing a review
 *  destroyed an adaptive session that was still in progress. */
export function removeStudySessionSlot(
  store: StudySessionStore,
  mode: ActiveStudySessionMode,
): StudySessionStore {
  if (!store.slots[mode]) return store;
  const slots = { ...store.slots };
  delete slots[mode];
  return { version: STUDY_SESSION_STORE_VERSION, slots };
}

/** True when no mode holds a session — the record can be removed entirely
 *  rather than left as an empty shell. */
export function isStudySessionStoreEmpty(store: StudySessionStore): boolean {
  return ACTIVE_STUDY_SESSION_MODES.every((mode) => !store.slots[mode]);
}

export { isActiveStudySessionMode };
