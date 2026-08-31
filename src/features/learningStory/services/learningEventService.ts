import { collection, DocumentData, getDocs, limit, orderBy, query, where } from "firebase/firestore";

import { StudyOutcome } from "@features/study/domain/studyTypes";
import { db } from "@services/firebase/config";

// Phase 59 — reading the chronological learning history.
//
// Both queries below are BOUNDED and ordered by the server-written
// `occurredAt`. Neither loads a lifetime of history and slices client-side;
// the limit is part of the query, so the read cost is fixed regardless of how
// long a student has used the app.

// How many recent events one screen may read. Large enough that several
// topics can each contribute a full trail, small enough to stay one cheap
// query. The trail itself shows at most MAX_TRAIL_EVENTS per topic.
export const MAX_RECENT_EVENTS = 40;

// The raw document, before subject/topic are joined in from the metadata
// cache. Deliberately mirrors the server record exactly — the event carries
// no question content of its own (see functions/src/study/learningEvent.ts).
export interface StoredLearningEvent {
  id: string;
  questionId: string;
  outcome: StudyOutcome;
  occurredAt: number;
  sourceClassId: string | null;
}

function isOutcome(value: unknown): value is StudyOutcome {
  return value === "solved" || value === "struggled" || value === "again";
}

// Skips any document that cannot be read as a real event rather than
// coercing it — a malformed row must never become a fabricated outcome.
function toEvent(id: string, data: DocumentData): StoredLearningEvent | null {
  const questionId = typeof data.questionId === "string" ? data.questionId : null;
  const occurredAt = typeof data.occurredAt === "number" ? data.occurredAt : null;
  if (!questionId || occurredAt === null || !isOutcome(data.outcome)) return null;
  return {
    id,
    questionId,
    outcome: data.outcome,
    occurredAt,
    sourceClassId: typeof data.sourceClassId === "string" ? data.sourceClassId : null,
  };
}

// A student's own recent learning events. Owner-read, exactly what
// firestore.rules' studyEvents rule grants without any teacher branch.
export async function getRecentLearningEvents(
  uid: string,
  max: number = MAX_RECENT_EVENTS,
): Promise<StoredLearningEvent[]> {
  const snapshot = await getDocs(
    query(
      collection(db, "users", uid, "studyEvents"),
      orderBy("occurredAt", "desc"),
      limit(max),
    ),
  );
  return snapshot.docs
    .map((d) => toEvent(d.id, d.data()))
    .filter((event): event is StoredLearningEvent => event !== null);
}

// One student's recent events WITHIN one class, for the teacher's on-demand
// student detail view.
//
// The `sourceClassId` equality filter is not a convenience — it is what makes
// the read provable under the rules (which resolve
// `resource.data.sourceClassId` to check the caller teaches that class), and
// it is also what scopes the teacher to their own classroom rather than a
// student's whole study life. The composite index for
// (sourceClassId ASC, occurredAt DESC) is declared in firestore.indexes.json.
export async function getRecentClassLearningEvents(
  studentUid: string,
  classId: string,
  max: number = MAX_RECENT_EVENTS,
): Promise<StoredLearningEvent[]> {
  const snapshot = await getDocs(
    query(
      collection(db, "users", studentUid, "studyEvents"),
      where("sourceClassId", "==", classId),
      orderBy("occurredAt", "desc"),
      limit(max),
    ),
  );
  return snapshot.docs
    .map((d) => toEvent(d.id, d.data()))
    .filter((event): event is StoredLearningEvent => event !== null);
}
