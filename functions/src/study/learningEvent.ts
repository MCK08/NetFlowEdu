import type { StudyOutcome } from "./reviewScheduler";

// Phase 59 — the chronological half of a learning outcome.
//
// WHY THIS EXISTS
//
// Phase 41's counters are cumulative TOTALS. They answer "how much has this
// student struggled on this question", and they answer it well. They cannot
// answer "in what ORDER did those outcomes happen", because a total has no
// order. Phase 56 refused to draw a `Zorlandım → Zorlandım → Çözdüm` trail
// for exactly that reason: the ordered evidence did not exist, and inventing
// it from totals would have been fabrication.
//
// This module creates that ordered evidence, from now on, as a real append-
// only event per confirmed outcome.
//
// WHAT IT DELIBERATELY DOES NOT CARRY
//
// No question content — no image, no description, and no subject/topic.
// StudyItemRecord documents its own reason for that ("snapshotting here
// would leak private/class material into a document the owner can read
// forever"), and an event lives even longer than an item, so the same rule
// applies with more force. Subject and topic are resolved on the client from
// the shared question-metadata cache it already loads, exactly as the Study
// Hub and the feed already do — so a student who loses class membership
// loses the content, while their own outcome history stays theirs.
//
// EVENT IDENTITY / IDEMPOTENCY
//
// The id is derived, never random. When the client supplied an operationId
// (every current client does — see gestureOperationId.ts) that id IS the
// event id, so the same logical gesture can only ever produce one document
// no matter how many times the callable is retried.
//
// Without an operationId the id falls back to questionId + the invocation's
// own server timestamp. `now` is captured ONCE per invocation, before the
// transaction opens, so a Firestore transaction retry re-derives the same id
// and `set` overwrites rather than appends. A *callable* auto-retry would
// mint a new `now` and therefore a new event — but that same retry would
// also re-increment the Phase 41 counters, because the replay guard those
// counters rely on is the operationId too. The event is therefore never
// weaker than the counters it accompanies; both are protected by exactly one
// mechanism, which is the property that keeps them consistent.

export const LEARNING_EVENT_SCHEMA_VERSION = 1;

// users/{uid}/studyEvents/{eventId}
export interface LearningEventRecord {
  questionId: string;
  outcome: StudyOutcome;
  // Server clock only. recordStudyOutcome's own note applies verbatim: "Server
  // time is the ONLY clock that counts" — a client cannot backdate an event to
  // manufacture a recovery narrative.
  occurredAt: number;
  // Mirrors StudyItemRecord.sourceClassId, and exists for the SAME reason: it
  // is what lets firestore.rules grant a teacher read access to exactly the
  // events that happened inside their own classroom, and nothing else.
  sourceClassId: string | null;
  schemaVersion: number;
}

// Firestore document ids may not contain "/", and must be non-empty. Question
// ids are Firestore-generated so they are already safe; this only guards the
// composed fallback form.
function safeSegment(value: string): string {
  return value.replace(/\//g, "_");
}

// Deterministic by construction — see the module note above.
export function buildLearningEventId(params: {
  questionId: string;
  operationId?: string;
  now: number;
}): string {
  if (params.operationId) return safeSegment(params.operationId);
  return `${safeSegment(params.questionId)}__${params.now}`;
}

export function buildLearningEventRecord(params: {
  questionId: string;
  outcome: StudyOutcome;
  now: number;
  sourceClassId: string | null;
}): LearningEventRecord {
  return {
    questionId: params.questionId,
    outcome: params.outcome,
    occurredAt: params.now,
    sourceClassId: params.sourceClassId,
    schemaVersion: LEARNING_EVENT_SCHEMA_VERSION,
  };
}
