import type {
  SemanticChoiceEvidence,
  SemanticOpportunityEvidence,
} from "./semanticChoiceEvidence";
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
  // Phase 78 — OPTIONAL server-derived meaning of the option the student
  // picked, present only when the pick was a wrong answer whose author had
  // attached a conceptKey (see semanticChoiceEvidence.ts for every reason it
  // is usually absent).
  //
  // Optional rather than a new schema version, and that is a deliberate
  // reading decision: every pre-Phase-78 event is still a completely valid
  // version-1 event, and nothing about how it is parsed changes. A reader that
  // does not know this field ignores it; a reader that does treats absence as
  // "this outcome carried no authored semantic meaning", which is exactly what
  // it means for both an old event and a new one. Bumping the version would
  // have implied old events need translating, and they do not.
  //
  // The payload itself is frozen at write time. If the author later edits the
  // question — changes the option, the feedback, or the key — this event still
  // says what was true when the student answered. Rewriting history to match a
  // later edit would destroy the only thing an event is for.
  semanticChoice?: SemanticChoiceEvidence;
  // Phase 79 — OPTIONAL record of which authored meanings were SELECTABLE when
  // this outcome was recorded, present only when the student actually picked an
  // option on a question that carried at least one.
  //
  // Same optional-field-under-the-same-version decision as semanticChoice, and
  // for the same reason: an event without it is not an event needing
  // translation, it is an event where this was never observed. That
  // distinction is load-bearing for Phase 79 — a legacy event proves nothing
  // about what was on the page, so it must never be read as a passed-over
  // opportunity.
  //
  // Frozen at write time. A later edit to the question's options, feedback or
  // keys does not rewrite what the server saw when the student answered.
  semanticOpportunities?: SemanticOpportunityEvidence;
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
  semanticChoice?: SemanticChoiceEvidence | null;
  semanticOpportunities?: SemanticOpportunityEvidence | null;
}): LearningEventRecord {
  const record: LearningEventRecord = {
    questionId: params.questionId,
    outcome: params.outcome,
    occurredAt: params.now,
    sourceClassId: params.sourceClassId,
    schemaVersion: LEARNING_EVENT_SCHEMA_VERSION,
  };
  // Spread only when present: Firestore throws on an `undefined` value, and
  // writing an explicit null would make every ordinary outcome carry a field
  // that means nothing to it.
  if (params.semanticChoice) record.semanticChoice = params.semanticChoice;
  if (params.semanticOpportunities) record.semanticOpportunities = params.semanticOpportunities;
  return record;
}
