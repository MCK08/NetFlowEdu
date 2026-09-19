// Phase 110 — "Bu Haftanın Sınıf İlerlemesi", driven through the SHIPPED
// handler (applyStudyEventToClassPulse, what the studyEvents trigger calls)
// against a real Firestore. Pins that the class aggregate is:
//   * counted from real class study events of CURRENT student members only;
//   * exactly once per event, even when the trigger is redelivered;
//   * distinct in participants (people, not outcomes);
//   * free of any uid or per-student figure.

import { deleteApp, initializeApp } from "../../functions/node_modules/firebase-admin/lib/app";
import { getFirestore } from "../../functions/node_modules/firebase-admin/lib/firestore";
import type { App } from "../../functions/node_modules/firebase-admin/lib/app";
import type { Firestore } from "../../functions/node_modules/firebase-admin/lib/firestore";

import { applyStudyEventToClassPulse, classPulseWeek } from "../../functions/src/classes/classPulse";

const PROJECT_ID = "netflow-edu-class-pulse-test";
const CLASS_A = "class-a";
const TEACHER = "teacher-a";
const S1 = "student-1";
const S2 = "student-2";
const OUTSIDER = "student-outside";
// Wednesday 2026-09-16 10:00 in Türkiye.
const WED = Date.UTC(2026, 8, 16, 7, 0, 0);
const WEEK = classPulseWeek(WED).weekKey;

let app: App;
let db: Firestore;

/** Starts this suite from an empty database — ONLY this suite's own project id,
 *  via the emulator's documented reset endpoint. Without it a second run finds
 *  the first run's records and every idempotency expectation shifts by one. */
async function resetEmulatorProject(projectId: string): Promise<void> {
  const url = `http://127.0.0.1:8080/emulator/v1/projects/${projectId}/databases/(default)/documents`;
  const response = await fetch(url, { method: "DELETE" });
  if (!response.ok) throw new Error(`emulator reset failed: ${response.status}`);
}

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  app = initializeApp({ projectId: PROJECT_ID }, `class-pulse-${Date.now()}`);
  db = getFirestore(app);
  await resetEmulatorProject(PROJECT_ID);
  await db.collection("classes").doc(CLASS_A).set({ name: "8-A", teacherId: TEACHER, status: "active" });
  for (const [uid, role] of [[TEACHER, "teacher"], [S1, "student"], [S2, "student"]] as const) {
    await db.collection("classes").doc(CLASS_A).collection("members").doc(uid).set({ uid, role, joinedAt: 1, displayName: uid });
  }
});

afterAll(async () => {
  await deleteApp(app);
});

const pulse = async (week = WEEK) =>
  (await db.collection("classes").doc(CLASS_A).collection("pulse").doc(week).get()).data();
const event = (outcome: string, occurredAt = WED, sourceClassId: string | null = CLASS_A) => ({
  questionId: "q", outcome, occurredAt, sourceClassId, schemaVersion: 1,
});

describe("class pulse aggregation", () => {
  it("counts a real class study event of a student member", async () => {
    expect(await applyStudyEventToClassPulse(db, { uid: S1, eventId: "e1", event: event("solved") })).toBe("counted");
    expect(await pulse()).toMatchObject({ weekKey: WEEK, outcomeCount: 1, solvedCount: 1, participantCount: 1 });
  });

  it("counts a redelivered event zero more times", async () => {
    expect(await applyStudyEventToClassPulse(db, { uid: S1, eventId: "e1", event: event("solved") })).toBe("duplicate");
    expect(await pulse()).toMatchObject({ outcomeCount: 1, solvedCount: 1, participantCount: 1 });
  });

  it("counts people, not outcomes, as participants", async () => {
    await applyStudyEventToClassPulse(db, { uid: S1, eventId: "e2", event: event("struggled") });
    expect(await pulse()).toMatchObject({ outcomeCount: 2, solvedCount: 1, participantCount: 1 });
    await applyStudyEventToClassPulse(db, { uid: S2, eventId: "e3", event: event("solved") });
    expect(await pulse()).toMatchObject({ outcomeCount: 3, solvedCount: 2, participantCount: 2 });
  });

  it("ignores anyone who is not a CURRENT student member", async () => {
    expect(await applyStudyEventToClassPulse(db, { uid: OUTSIDER, eventId: "x1", event: event("solved") })).toBe("not_member");
    expect(await applyStudyEventToClassPulse(db, { uid: TEACHER, eventId: "t1", event: event("solved") })).toBe("not_member");
    expect(await pulse()).toMatchObject({ outcomeCount: 3, participantCount: 2 });
  });

  it("stops counting a student the moment they leave", async () => {
    await db.collection("classes").doc(CLASS_A).collection("members").doc(S2).delete();
    expect(await applyStudyEventToClassPulse(db, { uid: S2, eventId: "e4", event: event("solved") })).toBe("not_member");
    expect(await pulse()).toMatchObject({ outcomeCount: 3, participantCount: 2 });
  });

  it("ignores events with no class, and malformed ones", async () => {
    expect(await applyStudyEventToClassPulse(db, { uid: S1, eventId: "p1", event: event("solved", WED, null) })).toBe("not_class");
    expect(await applyStudyEventToClassPulse(db, { uid: S1, eventId: "p2", event: event("guessed") })).toBe("invalid");
    expect(await applyStudyEventToClassPulse(db, { uid: S1, eventId: "p3", event: { ...event("solved"), occurredAt: "dün" } })).toBe("invalid");
    expect(await pulse()).toMatchObject({ outcomeCount: 3 });
  });

  it("keeps each week in its own document", async () => {
    const nextWeek = WED + 7 * 24 * 60 * 60 * 1000;
    await applyStudyEventToClassPulse(db, { uid: S1, eventId: "n1", event: event("solved", nextWeek) });
    expect(await pulse(classPulseWeek(nextWeek).weekKey)).toMatchObject({ outcomeCount: 1, participantCount: 1 });
    expect(await pulse()).toMatchObject({ outcomeCount: 3 });
  });

  it("holds counts only — no uid, no name, no per-student figure", async () => {
    const doc = (await pulse()) ?? {};
    expect(Object.keys(doc).sort()).toEqual(
      ["outcomeCount", "participantCount", "schemaVersion", "solvedCount", "updatedAt", "weekKey", "weekStart"].sort(),
    );
    const text = JSON.stringify(doc);
    for (const uid of [S1, S2, TEACHER]) expect(text).not.toContain(uid);
  });
});
