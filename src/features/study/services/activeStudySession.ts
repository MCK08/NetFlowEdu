import { isStudyOutcome } from "../domain/studyTypes";

import { createOperationId } from "./gestureOperationId";
import { appendSessionReceipt, SessionOutcomeReceipt } from "./sessionReflection";

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
 *  Bump the suffix only if the stored SHAPE changes incompatibly. */
export const ACTIVE_STUDY_SESSION_STORAGE_KEY = "netflowedu.study.active-session.v1";

export const ACTIVE_STUDY_SESSION_VERSION = 1;

// Only the mandatory review session has a receipt today. Adaptive and
// assignment sessions are deliberately excluded (see the phase doc), and the
// mode is persisted so a future addition cannot silently hydrate one kind of
// session's evidence into another.
export type ActiveStudySessionMode = "mandatory";

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

/** Parses the stored envelope. Total: returns null for anything it cannot
 *  fully vouch for, and never throws. */
export function parseActiveStudySession(raw: string | null): ActiveStudySessionEnvelope | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isPlainObject(parsed)) return null;

  // Fail closed on an unknown version. A newer build's shape must never be
  // reinterpreted by an older one as though it were understood.
  if (parsed.version !== ACTIVE_STUDY_SESSION_VERSION) return null;

  const sessionInstanceId = asString(parsed.sessionInstanceId);
  const userId = asString(parsed.userId);
  if (!sessionInstanceId || !userId) return null;
  if (parsed.mode !== "mandatory") return null;
  if (typeof parsed.startedAt !== "number" || !Number.isFinite(parsed.startedAt)) return null;
  if (!Array.isArray(parsed.receipts)) return null;

  // Folded through Phase 66's own append rule, so a duplicated operationId in
  // corrupted storage collapses exactly the way a replayed callback does —
  // one dedupe rule, not a second look-alike implementation.
  const receipts = parsed.receipts.reduce<SessionOutcomeReceipt[]>((acc, entry) => {
    const receipt = parseReceipt(entry);
    return receipt ? appendSessionReceipt(acc, receipt) : acc;
  }, []);

  return {
    version: ACTIVE_STUDY_SESSION_VERSION,
    sessionInstanceId,
    userId,
    mode: parsed.mode,
    startedAt: parsed.startedAt,
    receipts,
  };
}

export interface SessionStart {
  sessionInstanceId: string;
  /** Carried forward unchanged when resuming, so the staleness bound measures
   *  the session's real age rather than resetting on every refresh. */
  startedAt: number;
  receipts: SessionOutcomeReceipt[];
  /** True when a compatible active session was adopted rather than created. */
  resumed: boolean;
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
  const existing = parseActiveStudySession(params.raw);

  const compatible =
    existing !== null &&
    existing.userId === params.userId &&
    existing.mode === params.mode &&
    // Technical staleness only — see ACTIVE_SESSION_MAX_AGE_MS.
    params.now - existing.startedAt < ACTIVE_SESSION_MAX_AGE_MS &&
    params.now >= existing.startedAt;

  if (compatible && existing) {
    return {
      sessionInstanceId: existing.sessionInstanceId,
      startedAt: existing.startedAt,
      receipts: existing.receipts,
      resumed: true,
    };
  }

  return {
    sessionInstanceId: createSessionInstanceId(),
    startedAt: params.now,
    receipts: [],
    resumed: false,
  };
}

export function buildActiveStudySession(params: {
  sessionInstanceId: string;
  userId: string;
  mode: ActiveStudySessionMode;
  startedAt: number;
  receipts: readonly SessionOutcomeReceipt[];
}): ActiveStudySessionEnvelope {
  return {
    version: ACTIVE_STUDY_SESSION_VERSION,
    sessionInstanceId: params.sessionInstanceId,
    userId: params.userId,
    mode: params.mode,
    startedAt: params.startedAt,
    receipts: [...params.receipts],
  };
}

/** Serialises the envelope, writing ONLY the fields above.
 *
 *  Nothing question-shaped is persisted: no question text, no images, no
 *  answer choices, no teacher content, no student name, no queue snapshot and
 *  no Firestore cursor. subject/topic are carried because the reflection needs
 *  them after a restart and the answered item has by then left the due query —
 *  they are short learning metadata the session already held in memory, not
 *  content. */
export function serializeActiveStudySession(envelope: ActiveStudySessionEnvelope): string {
  return JSON.stringify({
    version: envelope.version,
    sessionInstanceId: envelope.sessionInstanceId,
    userId: envelope.userId,
    mode: envelope.mode,
    startedAt: envelope.startedAt,
    receipts: envelope.receipts.map((receipt) => ({
      operationId: receipt.operationId,
      questionId: receipt.questionId,
      subject: receipt.subject,
      topic: receipt.topic,
      outcome: receipt.outcome,
    })),
  });
}
