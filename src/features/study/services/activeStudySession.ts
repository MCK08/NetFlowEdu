import { isStudyOutcome } from "../domain/studyTypes";

import { createOperationId } from "./gestureOperationId";
import { appendSessionReceipt, SessionOutcomeReceipt } from "./sessionReflection";
import { parseStudySessionStore, readStudySessionSlot } from "./studySessionStore";

// Phase 67 — durable local identity for ONE active study session.
//
// WHY THIS EXISTS
//
// Phase 66 held the session receipt in React state, so a browser refresh, a
// backgrounded process or a route remount lost it and the closure summary
// under-reported outcomes the server had already accepted. This module makes
// that receipt survive an ordinary interruption.
//
// WHAT IT IS NOT
//
// Not a Firestore document, not an analytics session, not a security token,
// and not a learning-event identity. It is a LOCAL lifecycle identity, and
// nothing on the server knows it exists.
//
// THE RULE THAT SHAPES EVERYTHING HERE
//
// A session must identify itself. Membership is never inferred from
// timestamps, studyEvents proximity, question ordering or "the same twenty
// minutes" — a receipt is in this session because this session recorded it,
// full stop. That is the same refusal Phase 66 made when it declined to
// reconstruct sessions by scanning studyEvents, and persistence does not
// weaken it: what is written to storage is exactly what was already true in
// memory.
//
// Local storage is untrusted input. Everything below treats it that way.

/** Namespaced and versioned, following themeStorage's Phase 49 convention.
 *
 *  Phase 69 kept the KEY and versioned the payload instead (see
 *  studySessionStore.ts). A new key would have orphaned every session already
 *  in progress on a device; the payload's own version carries the migration,
 *  and orphaning real work to avoid a schema branch is the wrong trade. */
export const ACTIVE_STUDY_SESSION_STORAGE_KEY = "netflowedu.study.active-session.v1";

// Phase 68 — WRITES are version 2. READS still accept version 1.
//
// Version 1 (Phase 67) held a mandatory session with receipts and nothing
// else. Version 2 adds two fields, and the split matters in both directions:
//
//   · A v1 record is read as a v2 record with no frozen plan and no
//     completion stamp, which is exactly what it was. A session already in
//     progress when this build ships resumes normally.
//   · A v2 record is REJECTED by a Phase 67 build, because its parser pins
//     `version !== 1`. That is the property worth paying for: an older build
//     must never read a COMPLETED snapshot as an active session and fold a
//     finished session's receipts into the next one's "Bu çalışmada" summary.
//     Failing closed there costs one resume; reinterpreting would cost the
//     honesty the summary exists for.
//
// Phase 69 — this is now the newest LEGACY version. Writes go through
// studySessionStore.ts (version 3); these two remain because a device may
// still hold a v1/v2 record from a session that is genuinely in progress, and
// that session is migrated rather than discarded.
export const ACTIVE_STUDY_SESSION_VERSION = 2;

const READABLE_VERSIONS: readonly number[] = [1, 2];

// Phase 68 — adaptive sessions now have a real completion boundary (see
// adaptiveSessionCompletion.ts) and so can carry a receipt too. Assignment
// sessions remain excluded; see the phase doc.
//
// The mode is persisted, and matched exactly on hydration, so one kind of
// session's evidence can never be adopted by another.
export type ActiveStudySessionMode = "mandatory" | "adaptive";

/** The complete, closed set. Phase 69's store iterates THIS rather than the
 *  stored object's own keys, so a malformed record cannot invent a slot. */
export const ACTIVE_STUDY_SESSION_MODES: readonly ActiveStudySessionMode[] = [
  "mandatory",
  "adaptive",
];

export function isActiveStudySessionMode(value: unknown): value is ActiveStudySessionMode {
  return value === "mandatory" || value === "adaptive";
}

// The ONE time-based value in this module, and it is deliberately NOT session
// truth: it never decides which outcomes belong together, only whether an
// abandoned envelope is still plausibly the sitting in progress. Membership is
// already fixed by construction before this is ever consulted.
//
// Without it, receipts from a session abandoned days ago would silently
// reappear inside a later session's "Bu çalışmada" summary — precisely the
// dishonesty Phase 66 exists to prevent. Twelve hours cannot cut a real
// sitting in half, and expiring too eagerly only ever UNDER-counts, which is
// the safe direction: the alternative is inventing session membership.
export const ACTIVE_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export interface ActiveStudySessionEnvelope {
  version: number;
  sessionInstanceId: string;
  userId: string;
  mode: ActiveStudySessionMode;
  /** When this session instance began. Used ONLY for the staleness bound. */
  startedAt: number;
  receipts: SessionOutcomeReceipt[];
  /** Phase 68 — the FROZEN completion contract for an adaptive session: the
   *  question ids this session undertook to work through, fixed at the moment
   *  it began. Always empty for a mandatory session, whose scope is the due
   *  queue and is decided by the server, not by a local snapshot.
   *
   *  Ids only. No question text, no image, no answer choices — the questions
   *  are re-resolved from the shared metadata cache after a restart. */
  plannedQuestionIds: string[];
  /** Phase 68 — non-null once the session genuinely completed. A completed
   *  envelope is a SNAPSHOT, not an active session: it is never resumed as
   *  one, it exists so the closure summary survives a refresh, and it is
   *  cleared when acknowledged or when the next session begins. */
  completedAt: number | null;
}

/** A fresh local lifecycle id.
 *
 *  Reuses the existing gesture-id generator rather than adding a UUID
 *  dependency for this. It is only ever a local key — it is never sent to
 *  Firestore, never used as an operationId, and a collision could not affect
 *  server integrity because no server object references it. */
export function createSessionInstanceId(): string {
  return createOperationId();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Frozen plan ids, validated and de-duplicated.
 *
 *  Duplicates are normalised away rather than rejected. A completion contract
 *  built from a list containing the same id twice would demand two confirmed
 *  outcomes for one entry, which no single answer can ever satisfy — the
 *  session would be permanently unfinishable. De-duplicating is the only
 *  reading that stays achievable, and it is also the truthful one: the
 *  adaptive plan produces distinct questions by construction (buildTieredPlan
 *  de-dupes, and every tier claims what it takes), so a duplicate here means
 *  corrupted storage, not a real plan that wanted the question twice. */
export function normalizePlannedQuestionIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    const id = asString(entry);
    // A malformed entry is dropped, never coerced. Coercing would invent a
    // plan entry that can never be answered and so never completed.
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

/** One persisted receipt, validated field by field.
 *
 *  A malformed entry is dropped rather than taking the whole session with it:
 *  the surrounding receipts are still genuine confirmed outcomes, and dropping
 *  only the bad one under-counts by the smallest possible amount. */
function parseReceipt(value: unknown): SessionOutcomeReceipt | null {
  if (!isPlainObject(value)) return null;
  const operationId = asString(value.operationId);
  const questionId = asString(value.questionId);
  if (!operationId || !questionId) return null;
  if (!isStudyOutcome(value.outcome)) return null;
  // subject/topic are "" when metadata never resolved — the same legacy
  // convention Phase 66 uses. Absent is normalised to "", never to garbage.
  const subject = asString(value.subject) ?? "";
  const topic = asString(value.topic) ?? "";
  return { operationId, questionId, subject, topic, outcome: value.outcome };
}

/** Validates a stored receipt array.
 *
 *  Folded through Phase 66's own append rule, so a duplicated operationId in
 *  corrupted storage collapses exactly the way a replayed callback does — one
 *  dedupe rule, not a second look-alike implementation. Shared with Phase 69's
 *  store so both formats agree on what a receipt is. */
export function parseSessionReceipts(value: readonly unknown[]): SessionOutcomeReceipt[] {
  return value.reduce<SessionOutcomeReceipt[]>((acc, entry) => {
    const receipt = parseReceipt(entry);
    return receipt ? appendSessionReceipt(acc, receipt) : acc;
  }, []);
}

/** Parses one LEGACY (Phase 67 v1 / Phase 68 v2) single-session record.
 *
 *  Phase 69 no longer writes this shape; this is the migration input parser
 *  (studySessionStore.ts calls it), kept rather than re-implemented so the two
 *  formats cannot drift apart. Total: returns null for anything it cannot
 *  fully vouch for, and never throws. */
export function parseLegacyActiveStudySession(
  parsed: unknown,
): ActiveStudySessionEnvelope | null {
  if (!isPlainObject(parsed)) return null;

  // Fail closed on an unknown version. A newer build's shape must never be
  // reinterpreted by an older one as though it were understood. Version 1 is
  // read because this build understands it completely — see the constant.
  if (typeof parsed.version !== "number" || !READABLE_VERSIONS.includes(parsed.version)) return null;

  const sessionInstanceId = asString(parsed.sessionInstanceId);
  const userId = asString(parsed.userId);
  if (!sessionInstanceId || !userId) return null;
  if (!isActiveStudySessionMode(parsed.mode)) return null;
  if (typeof parsed.startedAt !== "number" || !Number.isFinite(parsed.startedAt)) return null;
  if (!Array.isArray(parsed.receipts)) return null;

  // A v1 record predates both fields, so both take their "was not there"
  // value rather than anything inferred.
  const plannedQuestionIds = normalizePlannedQuestionIds(parsed.plannedQuestionIds);
  const completedAt =
    typeof parsed.completedAt === "number" && Number.isFinite(parsed.completedAt)
      ? parsed.completedAt
      : null;

  const receipts = parseSessionReceipts(parsed.receipts);

  return {
    version: ACTIVE_STUDY_SESSION_VERSION,
    sessionInstanceId,
    userId,
    mode: parsed.mode,
    startedAt: parsed.startedAt,
    receipts,
    plannedQuestionIds,
    completedAt,
  };
}

/** The string-level entry point for the legacy format, retained because the
 *  Phase 67/68 tests exercise it directly and the migration path depends on
 *  exactly this behaviour. */
export function parseActiveStudySession(raw: string | null): ActiveStudySessionEnvelope | null {
  if (!raw) return null;
  try {
    return parseLegacyActiveStudySession(JSON.parse(raw));
  } catch {
    return null;
  }
}

export interface SessionStart {
  sessionInstanceId: string;
  /** Carried forward unchanged when resuming, so the staleness bound measures
   *  the session's real age rather than resetting on every refresh. */
  startedAt: number;
  receipts: SessionOutcomeReceipt[];
  /** True when a compatible active session was adopted rather than created. */
  resumed: boolean;
  /** Phase 68 — the frozen plan a resumed adaptive session must keep working
   *  through. Empty for a new session (the caller freezes the live plan) and
   *  for every mandatory session. */
  plannedQuestionIds: string[];
}

/** Decides whether this mount resumes the active session or begins a new one.
 *
 *  Resuming requires an EXPLICIT match on every scope that could make two
 *  sessions different things — same user, same mode, same schema version —
 *  never merely "a receipt exists". A mismatch is not an error: it simply
 *  means the persisted session belongs to something else, and a new one
 *  starts with no evidence carried across.
 *
 *  A non-matching record is left in place rather than deleted. It is scoped by
 *  userId and validated before every hydration, so it can never become visible
 *  to another account; deleting it would instead destroy the real session of
 *  whoever it belongs to, merely because someone else opened Study on the same
 *  device. Storage stays bounded because there is exactly one key. */
export function resolveSessionStart(params: {
  raw: string | null;
  userId: string;
  mode: ActiveStudySessionMode;
  now: number;
}): SessionStart {
  // Phase 69 — reads THIS MODE'S slot. The sibling mode's session is not
  // consulted, not compared against, and not touched: entering one mode is
  // not a statement about the other, which is the whole point of the phase.
  const existing = readStudySessionSlot(parseStudySessionStore(params.raw), params.mode);

  const compatible =
    existing !== null &&
    existing.userId === params.userId &&
    existing.mode === params.mode &&
    // Phase 68 — a COMPLETED session is not an active one. Resuming it would
    // reopen a finished sitting and carry its receipts into the next one,
    // which is the precise dishonesty Phase 66 exists to prevent. The
    // completed snapshot is read separately, by resolveCompletedSession.
    existing.completedAt === null &&
    // Technical staleness only — see ACTIVE_SESSION_MAX_AGE_MS.
    params.now - existing.startedAt < ACTIVE_SESSION_MAX_AGE_MS &&
    params.now >= existing.startedAt;

  if (compatible && existing) {
    return {
      sessionInstanceId: existing.sessionInstanceId,
      startedAt: existing.startedAt,
      receipts: existing.receipts,
      resumed: true,
      plannedQuestionIds: existing.plannedQuestionIds,
    };
  }

  return {
    sessionInstanceId: createSessionInstanceId(),
    startedAt: params.now,
    receipts: [],
    resumed: false,
    plannedQuestionIds: [],
  };
}

/** The just-completed session's snapshot, when one is stored for this exact
 *  user and mode.
 *
 *  Phase 67 kept its completion summary in React state only, so refreshing on
 *  the completion screen lost it — the session was already cleared from
 *  storage by then, and rebuilding it was impossible without inventing
 *  membership. This is the smallest thing that fixes that: the SAME envelope,
 *  stamped completed, read back deliberately rather than resumed.
 *
 *  Scoped exactly as strictly as an active session — same user, same mode,
 *  same readable version, same staleness bound — because a summary is
 *  evidence, and evidence that crosses accounts or modes is worse than no
 *  summary at all. Returns null for an ACTIVE record: a session still running
 *  has not earned a closure screen. */
export function resolveCompletedSession(params: {
  raw: string | null;
  userId: string;
  mode: ActiveStudySessionMode;
  now: number;
}): ActiveStudySessionEnvelope | null {
  const existing = readStudySessionSlot(parseStudySessionStore(params.raw), params.mode);
  if (!existing || existing.completedAt === null) return null;
  if (existing.userId !== params.userId || existing.mode !== params.mode) return null;
  if (params.now < existing.startedAt) return null;
  if (params.now - existing.startedAt >= ACTIVE_SESSION_MAX_AGE_MS) return null;
  return existing;
}

export function buildActiveStudySession(params: {
  sessionInstanceId: string;
  userId: string;
  mode: ActiveStudySessionMode;
  startedAt: number;
  receipts: readonly SessionOutcomeReceipt[];
  /** Frozen adaptive plan; omitted for a mandatory session. */
  plannedQuestionIds?: readonly string[];
  /** Stamped only by a genuine completion — see resolveCompletedSession. */
  completedAt?: number | null;
}): ActiveStudySessionEnvelope {
  return {
    version: ACTIVE_STUDY_SESSION_VERSION,
    sessionInstanceId: params.sessionInstanceId,
    userId: params.userId,
    mode: params.mode,
    startedAt: params.startedAt,
    receipts: [...params.receipts],
    plannedQuestionIds: normalizePlannedQuestionIds(params.plannedQuestionIds ?? []),
    completedAt: params.completedAt ?? null,
  };
}
