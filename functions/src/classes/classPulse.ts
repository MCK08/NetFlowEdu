import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";

// Phase 110 — "Bu Haftanın Sınıf İlerlemesi": what a class did together this
// week, as a class.
//
// WHY A SERVER AGGREGATE
//
// The honest source of "the class studied" is each student's own study events,
// and those are private: no student may read another's, and no client should
// ever scan them. So the only place this can be counted is here, from the event
// the server itself just wrote, into one document that holds nothing but
// counts. No uid, no name, no per-student figure — there is nothing in it that
// could order one student against another.
//
// WHAT IS COUNTED
//
// A study outcome recorded on a question the student met in THIS class
// (studyEvents.sourceClassId, set by recordStudyOutcome — the same field that
// scopes a teacher's view of class evidence) by a CURRENT student member of the
// class. A student who has since left is not counted; a teacher never records
// outcomes. Counting never changes how any outcome is classified: this reads the
// event after the fact and touches no study document.
//
// EXACTLY ONCE, AND DISTINCT
//
// Firestore triggers are at-least-once. Each event leaves a marker, so a
// redelivered event is recognised and counted zero more times; each student
// leaves a participant marker, so "how many took part" counts people, not
// outcomes. Both markers live under the week's document where firestore.rules
// grants no read at all.

// Türkiye time — UTC+03:00 all year (no DST since 2016). The class's week runs
// Monday 00:00 to Sunday 23:59 local, the week a Turkish school actually uses.
export const PULSE_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface PulseWeek {
  /** The local Monday as YYYY-MM-DD — also the pulse document's id. */
  weekKey: string;
  /** That Monday 00:00 local, as a real epoch ms. */
  weekStart: number;
}

export function classPulseWeek(timestamp: number): PulseWeek {
  const local = new Date(timestamp + PULSE_UTC_OFFSET_MS);
  const daysSinceMonday = (local.getUTCDay() + 6) % 7;
  const localMidnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const localMonday = localMidnight - daysSinceMonday * DAY_MS;
  const monday = new Date(localMonday);
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    weekKey: `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`,
    weekStart: localMonday - PULSE_UTC_OFFSET_MS,
  };
}

export type ClassPulseResult = "counted" | "duplicate" | "not_class" | "not_member" | "invalid";

export interface ClassPulseEventInput {
  uid: string;
  eventId: string;
  event: Record<string, unknown>;
}

const isSegment = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 200 && !value.includes("/");

export async function applyStudyEventToClassPulse(
  db: Firestore,
  input: ClassPulseEventInput,
): Promise<ClassPulseResult> {
  const { uid, eventId, event } = input;
  const classId = event.sourceClassId;
  if (!isSegment(classId)) return "not_class";
  if (!isSegment(uid) || !isSegment(eventId)) return "invalid";

  const outcome = event.outcome;
  const occurredAt = event.occurredAt;
  if (
    (outcome !== "solved" && outcome !== "struggled" && outcome !== "again") ||
    typeof occurredAt !== "number" ||
    !Number.isFinite(occurredAt)
  ) {
    return "invalid";
  }

  const { weekKey, weekStart } = classPulseWeek(occurredAt);
  const classRef = db.collection("classes").doc(classId);
  const pulseRef = classRef.collection("pulse").doc(weekKey);
  const memberRef = classRef.collection("members").doc(uid);
  const markerRef = pulseRef.collection("events").doc(`${uid}__${eventId}`);
  const participantRef = pulseRef.collection("participants").doc(uid);

  return db.runTransaction(async (tx) => {
    const [markerSnap, memberSnap, participantSnap] = await Promise.all([
      tx.get(markerRef),
      tx.get(memberRef),
      tx.get(participantRef),
    ]);

    if (markerSnap.exists) return "duplicate";
    if (!memberSnap.exists || memberSnap.data()?.role !== "student") return "not_member";

    const isNewParticipant = !participantSnap.exists;
    tx.set(markerRef, { countedAt: FieldValue.serverTimestamp() });
    if (isNewParticipant) tx.set(participantRef, { firstCountedAt: FieldValue.serverTimestamp() });
    tx.set(
      pulseRef,
      {
        weekKey,
        weekStart,
        outcomeCount: FieldValue.increment(1),
        solvedCount: FieldValue.increment(outcome === "solved" ? 1 : 0),
        participantCount: FieldValue.increment(isNewParticipant ? 1 : 0),
        updatedAt: FieldValue.serverTimestamp(),
        schemaVersion: 1,
      },
      { merge: true },
    );
    return "counted";
  });
}

export const onStudyEventCreateUpdateClassPulse = onDocumentCreated(
  "users/{uid}/studyEvents/{eventId}",
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    await applyStudyEventToClassPulse(getFirestore(), {
      uid: event.params.uid,
      eventId: event.params.eventId,
      event: data,
    });
  },
);
