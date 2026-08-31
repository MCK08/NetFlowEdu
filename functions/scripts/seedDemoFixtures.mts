// Phase 48.1 — deterministic emulator-only demo fixtures.
//
// WHY THIS EXISTS
//
// Phase 48 runtime QA stopped honestly: the repository had no way to
// produce the deterministic personas (repeated struggle, recovering,
// stable, legacy/insufficient, no_change/worsened intervention outcomes)
// that Phase 44B/45/46/47 runtime acceptance requires. This script is
// QA/testing infrastructure ONLY — it adds no product feature, no schema,
// no collection the app doesn't already have, and no Cloud Function.
//
// WHAT IT DOES
//
// Writes directly to the Firestore/Auth EMULATORS via the Admin SDK
// (already a `functions/` dependency — no new package was added). Admin
// SDK writes bypass firestore.rules entirely, which is fine for fixture
// SETUP (see the file-level comment in each section for which fields a
// real product flow would normally have written instead — Cloud Function
// output, assignment publish, recordStudyOutcome). This script is not
// evidence those paths work; Phase 48's runtime QA still has to exercise
// them separately through the real app.
//
// SAFETY
//
// Refuses to run unless FIRESTORE_EMULATOR_HOST (and FIREBASE_AUTH_EMULATOR_HOST,
// since this script also creates Auth users) are set, and refuses if either
// looks like anything other than a local host. There is no flag to bypass
// this. See assertEmulatorOnly() below.
//
// IDEMPOTENCY
//
// Every id used below is a fixed, deterministic string (no Date.now(),
// no random ids). Every write is a `.set()` on that fixed id, so rerunning
// this script reproduces the exact same logical state — safe to run as
// often as needed, e.g. `npm run demo:seed` before every Phase 48 QA pass.

import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

// ---------------------------------------------------------------------------
// 0 — SAFETY: refuse anything but a local emulator.
// ---------------------------------------------------------------------------

function assertEmulatorOnly(): void {
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;

  if (!firestoreHost) {
    console.error(
      "[seedDemoFixtures] REFUSING TO RUN: FIRESTORE_EMULATOR_HOST is not set.\n" +
        "This script writes only to local Firebase emulators, never to production.\n" +
        "Run it via `npm run demo:seed` (wraps `firebase emulators:exec --only auth,firestore`)\n" +
        "or against an already-running `npm run emulators` session with the host env vars exported\n" +
        "(the Firebase emulator UI shows the exact values — typically 127.0.0.1:8080 / 127.0.0.1:9099).",
    );
    process.exit(1);
  }
  if (!authHost) {
    console.error(
      "[seedDemoFixtures] REFUSING TO RUN: FIREBASE_AUTH_EMULATOR_HOST is not set.\n" +
        "This script creates Auth users and must run against the Auth emulator, never production.",
    );
    process.exit(1);
  }

  const isLocal = (host: string) => /^(127\.0\.0\.1|localhost|0\.0\.0\.0|::1)(:\d+)?$/.test(host);
  if (!isLocal(firestoreHost) || !isLocal(authHost)) {
    console.error(
      `[seedDemoFixtures] REFUSING TO RUN: emulator host does not look local.\n` +
        `  FIRESTORE_EMULATOR_HOST=${firestoreHost}\n` +
        `  FIREBASE_AUTH_EMULATOR_HOST=${authHost}\n` +
        "Only 127.0.0.1 / localhost / 0.0.0.0 / ::1 hosts are accepted.",
    );
    process.exit(1);
  }

  console.log(
    `[seedDemoFixtures] emulator-only guard passed (firestore=${firestoreHost}, auth=${authHost}).`,
  );
}

assertEmulatorOnly();

// MUST match the real app's EXPO_PUBLIC_FIREBASE_PROJECT_ID (see .env).
// Unlike Firestore's `singleProjectMode` (firebase.json), the Auth emulator
// partitions users strictly by project id with no coalescing — seeding
// under a different, synthetic project id here would create Auth users the
// real app (configured for the actual project id) can never sign in as,
// while Firestore writes would silently appear to "work" via the
// single-project-mode warning. Override via DEMO_SEED_PROJECT_ID only if
// the app's own configured project id ever changes.
const PROJECT_ID = process.env.DEMO_SEED_PROJECT_ID ?? "netflowedu-2a8a9";
initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();
const auth = getAuth();

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.now();

function ts(epochMs: number): Timestamp {
  return Timestamp.fromMillis(epochMs);
}

// ---------------------------------------------------------------------------
// 1 — IDENTITIES. Synthetic, deterministic, *.example.test only — never a
// real domain, never real personal data.
// ---------------------------------------------------------------------------

const ORG_ID = "demo-org";
const CLASS_ID = "demo-class-1";
const CLASS_NAME = "Demo Sınıfı";
const CLASS_JOIN_CODE = "DEMO01";

const TEACHER = { uid: "demo-teacher-1", email: "teacher-demo@example.test", displayName: "Demo Öğretmen" };

interface StudentPersona {
  uid: string;
  email: string;
  displayName: string;
  purpose: string;
}

const STUDENTS: StudentPersona[] = [
  { uid: "demo-student-a", email: "student-a@example.test", displayName: "Öğrenci A", purpose: "repeated struggle (Phase 45/46 ranking + Phase 44B attribution order)" },
  { uid: "demo-student-b", email: "student-b@example.test", displayName: "Öğrenci B", purpose: "recovering — intervention effectiveness: improved" },
  { uid: "demo-student-c", email: "student-c@example.test", displayName: "Öğrenci C", purpose: "stable — control persona, legacy-fallback attribution" },
  { uid: "demo-student-d", email: "student-d@example.test", displayName: "Öğrenci D", purpose: "legacy/insufficient — pre-Phase-41 counters" },
  { uid: "demo-student-e", email: "student-e@example.test", displayName: "Öğrenci E", purpose: "intervention effectiveness: no_change" },
  { uid: "demo-student-f", email: "student-f@example.test", displayName: "Öğrenci F", purpose: "intervention effectiveness: worsened" },
];

const DEMO_PASSWORD = "Demo123!"; // emulator-only synthetic credential — never valid outside the Auth emulator

// ---------------------------------------------------------------------------
// 2 — QUESTIONS. Five fixed questions, all class-visibility, owned by the
// demo teacher. `imageUrl` is a placeholder — no Storage upload is part of
// fixture setup; Storage/Answer QA is a separate Phase 48 concern.
// ---------------------------------------------------------------------------

const PLACEHOLDER_IMAGE_URL = "https://storage.googleapis.com/netflowedu-demo-fixtures/placeholder-question.png";

const SUBJECT = "Matematik";
const TOPIC = "Denklemler";
const GRADE = "10";

const Q_HEAVY = "demo-q-heavy";
const Q_LIGHT = "demo-q-light";
const Q_INT_1 = "demo-q-int-1";
const Q_INT_2 = "demo-q-int-2";
const Q_INT_3 = "demo-q-int-3";

const QUESTION_IDS = [Q_HEAVY, Q_LIGHT, Q_INT_1, Q_INT_2, Q_INT_3];

async function seedQuestions(): Promise<void> {
  const batch = db.batch();
  for (const id of QUESTION_IDS) {
    batch.set(db.collection("questions").doc(id), {
      id,
      ownerId: TEACHER.uid,
      organizationId: ORG_ID,
      visibility: "class",
      imageUrl: PLACEHOLDER_IMAGE_URL,
      classId: CLASS_ID,
      subject: SUBJECT,
      topic: TOPIC,
      gradeLevel: GRADE,
      description: null,
      posterRole: "teacher",
      createdAt: NOW - 30 * DAY_MS,
      likeCount: 0,
      commentCount: 0,
      answerCount: 0,
      choices: null,
      correctChoice: null,
    });
  }
  await batch.commit();
  console.log(`[seedDemoFixtures] seeded ${QUESTION_IDS.length} questions.`);
}

// ---------------------------------------------------------------------------
// 3 — AUTH USERS + users/{uid} PROFILES + CUSTOM CLAIMS.
//
// Fields normally written by functions/src/triggers/onUserCreate.ts
// (role/organizationId/totalPoints/weeklyPoints/accountStatus/createdAt)
// and functions/src/onboarding/completeOnboarding.ts (onboardingStatus)
// are reproduced here directly, since the Functions emulator's triggers
// are not assumed to be running when this script is used standalone.
// ---------------------------------------------------------------------------

async function upsertAuthUser(uid: string, email: string, displayName: string): Promise<void> {
  try {
    await auth.createUser({ uid, email, password: DEMO_PASSWORD, displayName, emailVerified: true });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code !== "auth/uid-already-exists" && code !== "auth/email-already-exists") throw err;
    await auth.updateUser(uid, { email, password: DEMO_PASSWORD, displayName, emailVerified: true });
  }
}

async function seedIdentities(): Promise<void> {
  await upsertAuthUser(TEACHER.uid, TEACHER.email, TEACHER.displayName);
  await auth.setCustomUserClaims(TEACHER.uid, { role: "teacher", organizationId: ORG_ID });
  await db.collection("users").doc(TEACHER.uid).set({
    uid: TEACHER.uid,
    email: TEACHER.email,
    displayName: TEACHER.displayName,
    username: "demo_teacher",
    role: "teacher",
    organizationId: ORG_ID,
    photoURL: null,
    totalPoints: 0,
    weeklyPoints: 0,
    accountStatus: "active",
    emailVerified: true,
    onboardingStatus: "complete",
    requestedRole: "teacher",
    createdAt: NOW - 60 * DAY_MS,
    updatedAt: NOW - 60 * DAY_MS,
  });

  for (const student of STUDENTS) {
    await upsertAuthUser(student.uid, student.email, student.displayName);
    await auth.setCustomUserClaims(student.uid, { role: "student", organizationId: ORG_ID });
    await db.collection("users").doc(student.uid).set({
      uid: student.uid,
      email: student.email,
      displayName: student.displayName,
      username: student.uid.replace(/-/g, "_"),
      role: "student",
      organizationId: ORG_ID,
      photoURL: null,
      totalPoints: 0,
      weeklyPoints: 0,
      accountStatus: "active",
      emailVerified: true,
      onboardingStatus: "complete",
      requestedRole: "student",
      createdAt: NOW - 45 * DAY_MS,
      updatedAt: NOW - 45 * DAY_MS,
    });
  }
  console.log(`[seedDemoFixtures] seeded 1 teacher + ${STUDENTS.length} students (Auth + users/{uid}).`);
}

// ---------------------------------------------------------------------------
// 4 — CLASS + MEMBERSHIP.
//
// Shape mirrors functions/src/classes/createClass.ts / joinClassByCode.ts's
// own writes exactly (same field names/types) — a real class created
// through the app looks identical to this one.
// ---------------------------------------------------------------------------

async function seedClass(): Promise<void> {
  await db.collection("classes").doc(CLASS_ID).set({
    name: CLASS_NAME,
    organizationId: ORG_ID,
    teacherId: TEACHER.uid,
    joinCode: CLASS_JOIN_CODE,
    createdAt: ts(NOW - 60 * DAY_MS),
    updatedAt: ts(NOW - 60 * DAY_MS),
    memberCount: 1 + STUDENTS.length,
    status: "active",
  });
  await db.collection("classJoinCodes").doc(CLASS_JOIN_CODE).set({
    classId: CLASS_ID,
    createdAt: ts(NOW - 60 * DAY_MS),
  });

  const membersRef = db.collection("classes").doc(CLASS_ID).collection("members");
  await membersRef.doc(TEACHER.uid).set({
    uid: TEACHER.uid,
    role: "teacher",
    joinedAt: ts(NOW - 60 * DAY_MS),
    displayName: TEACHER.displayName,
    username: "demo_teacher",
    photoURL: null,
  });
  for (const student of STUDENTS) {
    await membersRef.doc(student.uid).set({
      uid: student.uid,
      role: "student",
      joinedAt: ts(NOW - 45 * DAY_MS),
      displayName: student.displayName,
      username: student.uid.replace(/-/g, "_"),
      photoURL: null,
    });
  }
  console.log(`[seedDemoFixtures] seeded class ${CLASS_ID} with ${1 + STUDENTS.length} members.`);
}

// ---------------------------------------------------------------------------
// 5 — STUDY ITEMS (users/{uid}/studyItems/{questionId}).
//
// Fields normally written by functions/src/study/recordStudyOutcome.ts on
// every real answer. Reproduced here to reach a specific cumulative state
// directly, honoring the exact Phase 41 completeness invariant
// (solvedCount + struggledCount + againCount === attemptCount, or the
// counters are omitted entirely to represent a genuinely pre-Phase-41 item
// — see src/features/study/services/outcomeCounters.ts).
// ---------------------------------------------------------------------------

interface StudyItemSeed {
  studentUid: string;
  questionId: string;
  status: "learning" | "review" | "mastered";
  lastOutcome: "again" | "struggled" | "solved";
  intervalDays: number;
  successfulReviews: number;
  attemptCount: number;
  lastReviewedAt: number;
  nextReviewAt: number;
  // undefined (all three) => legacy item, no trustworthy cumulative history
  solvedCount?: number;
  struggledCount?: number;
  againCount?: number;
}

function studyItemDoc(seed: StudyItemSeed) {
  const base = {
    questionId: seed.questionId,
    status: seed.status,
    lastOutcome: seed.lastOutcome,
    intervalDays: seed.intervalDays,
    successfulReviews: seed.successfulReviews,
    attemptCount: seed.attemptCount,
    firstAddedAt: seed.lastReviewedAt - seed.attemptCount * DAY_MS,
    lastReviewedAt: seed.lastReviewedAt,
    nextReviewAt: seed.nextReviewAt,
    source: "class" as const,
    sourceClassId: CLASS_ID,
    questionOwnerId: TEACHER.uid,
    schemaVersion: 1,
    updatedAt: seed.lastReviewedAt,
  };
  if (seed.solvedCount === undefined) return base; // legacy: counters genuinely absent
  return {
    ...base,
    solvedCount: seed.solvedCount,
    struggledCount: seed.struggledCount,
    againCount: seed.againCount,
  };
}

async function seedStudyItems(): Promise<void> {
  const recent = NOW - 1 * DAY_MS;
  const items: StudyItemSeed[] = [
    // --- Student A: repeated struggle, Q-heavy vs Q-light -----------------
    // Same topic/tier/status/recency bucket on purpose — the only signal
    // that should differ is struggledCount, which is exactly what Phase 45
    // /46's tie-break reads.
    {
      studentUid: STUDENTS[0].uid, questionId: Q_HEAVY, status: "learning", lastOutcome: "struggled",
      intervalDays: 1, successfulReviews: 0, attemptCount: 10, lastReviewedAt: recent, nextReviewAt: NOW + 1 * DAY_MS,
      solvedCount: 2, struggledCount: 8, againCount: 0,
    },
    {
      studentUid: STUDENTS[0].uid, questionId: Q_LIGHT, status: "learning", lastOutcome: "struggled",
      intervalDays: 1, successfulReviews: 0, attemptCount: 10, lastReviewedAt: recent, nextReviewAt: NOW + 1 * DAY_MS,
      solvedCount: 8, struggledCount: 2, againCount: 0,
    },

    // --- Student C: stable control -----------------------------------------
    {
      studentUid: STUDENTS[2].uid, questionId: Q_HEAVY, status: "review", lastOutcome: "solved",
      intervalDays: 8, successfulReviews: 3, attemptCount: 5, lastReviewedAt: recent, nextReviewAt: NOW + 8 * DAY_MS,
      solvedCount: 5, struggledCount: 0, againCount: 0,
    },

    // --- Student D: legacy / insufficient — counters genuinely absent -----
    {
      studentUid: STUDENTS[3].uid, questionId: Q_HEAVY, status: "learning", lastOutcome: "struggled",
      intervalDays: 1, successfulReviews: 0, attemptCount: 6, lastReviewedAt: recent, nextReviewAt: NOW + 1 * DAY_MS,
      // no solvedCount/struggledCount/againCount => resolveOutcomeHistory() === null
    },
  ];

  const batch = db.batch();
  for (const item of items) {
    batch.set(
      db.collection("users").doc(item.studentUid).collection("studyItems").doc(item.questionId),
      studyItemDoc(item),
    );
  }
  await batch.commit();
  console.log(`[seedDemoFixtures] seeded ${items.length} study items (A ×2, C ×1, D ×1).`);
}

// ---------------------------------------------------------------------------
// 5b — LEARNING EVENTS (users/{uid}/studyEvents/{eventId}).  Phase 59.
//
// EMULATOR-ONLY QA FIXTURES. These are NOT a production backfill and must
// never be treated as one: Phase 59 creates chronological history only from
// real outcomes recorded from Phase 59 onward, and deliberately refuses to
// synthesise events from Phase 41's cumulative counters (which carry no
// order). These rows exist purely so the emulator can exercise the Learning
// Trail without a human answering questions by hand first.
//
// Shape matches functions/src/study/learningEvent.ts exactly, and event ids
// use the same operationId-derived form the real write path produces.
//
// Timestamps are deterministic offsets from NOW, never Date.now() per row, so
// ordering assertions are reproducible across runs.
//
// Student D deliberately gets NOTHING — the legacy honesty gate. Their
// cumulative item has no trustworthy counters and they must have no
// chronological history either, so the UI has to fall back honestly rather
// than inventing a journey.
// ---------------------------------------------------------------------------

interface LearningEventSeed {
  studentUid: string;
  questionId: string;
  outcome: "again" | "struggled" | "solved";
  // Days before NOW. Larger = older.
  daysAgo: number;
}

async function seedLearningEvents(): Promise<void> {
  const events: LearningEventSeed[] = [
    // Student A — the signature trail: struggle → struggle → solve.
    // Matches their cumulative story (8 struggles on Q-heavy) without
    // pretending these three ARE those eight.
    { studentUid: STUDENTS[0].uid, questionId: Q_HEAVY, outcome: "struggled", daysAgo: 5 },
    { studentUid: STUDENTS[0].uid, questionId: Q_HEAVY, outcome: "struggled", daysAgo: 3 },
    { studentUid: STUDENTS[0].uid, questionId: Q_LIGHT, outcome: "solved", daysAgo: 2 },

    // Student B — recovering: struggle → solve → solve.
    { studentUid: STUDENTS[1].uid, questionId: Q_HEAVY, outcome: "struggled", daysAgo: 6 },
    { studentUid: STUDENTS[1].uid, questionId: Q_HEAVY, outcome: "solved", daysAgo: 4 },
    { studentUid: STUDENTS[1].uid, questionId: Q_LIGHT, outcome: "solved", daysAgo: 1 },

    // Student C — steady.
    { studentUid: STUDENTS[2].uid, questionId: Q_HEAVY, outcome: "solved", daysAgo: 4 },
    { studentUid: STUDENTS[2].uid, questionId: Q_HEAVY, outcome: "solved", daysAgo: 2 },

    // Student D — intentionally absent. See the header note.
  ];

  const batch = db.batch();
  for (const [index, event] of events.entries()) {
    const occurredAt = NOW - event.daysAgo * DAY_MS;
    // Same id shape the real path mints from a client operationId, and unique
    // per seeded row so a reseed overwrites rather than duplicating.
    const eventId = `demo-op-${event.studentUid}-${index}`;
    batch.set(
      db.collection("users").doc(event.studentUid).collection("studyEvents").doc(eventId),
      {
        questionId: event.questionId,
        outcome: event.outcome,
        occurredAt,
        sourceClassId: CLASS_ID,
        schemaVersion: 1,
      },
    );
  }
  await batch.commit();
  console.log(
    `[seedDemoFixtures] seeded ${events.length} learning events (A ×3, B ×3, C ×2, D ×0 — legacy gate).`,
  );
}

// ---------------------------------------------------------------------------
// 6 — ASSIGNMENTS + SUBMISSIONS.
//
// Shapes match src/features/assignments/domain/assignmentTypes.ts exactly.
// Fields normally set by assignmentCreation.ts/assignmentService.ts on
// publish, and by useAssignmentSession.ts/assignmentProgress.ts on
// completion, are reproduced directly to reach each target state without
// re-running the full UI flow for every persona.
// ---------------------------------------------------------------------------

interface AssignmentSeed {
  id: string;
  studentUid: string;
  interventionOf: { subject: string; topic: string } | null;
  createdAt: number;
  questionIds: string[];
  frozenOutcomes: Record<string, "again" | "struggled" | "solved">;
}

async function seedAssignment(seed: AssignmentSeed): Promise<void> {
  await db.collection("assignments").doc(seed.id).set({
    id: seed.id,
    classId: CLASS_ID,
    organizationId: ORG_ID,
    teacherId: TEACHER.uid,
    title: seed.interventionOf ? `Takip Ödevi — ${seed.interventionOf.topic}` : "Alıştırma Ödevi",
    description: null,
    subject: SUBJECT,
    topic: TOPIC,
    gradeLevel: GRADE,
    targetStudentIds: [seed.studentUid],
    questionIds: seed.questionIds,
    targetCount: seed.questionIds.length,
    // dueAt stays a plain epoch-ms NUMBER on purpose: assignmentService.ts's
    // toAssignment reads it with `typeof data.dueAt === "number"`, unlike
    // createdAt/updatedAt below. The two really are different shapes in the
    // production schema; matching each one exactly is the whole point here.
    dueAt: seed.createdAt + 7 * DAY_MS,
    status: "published",
    // MUST be Firestore Timestamps, not raw numbers. Production writes these
    // via serverTimestamp(), and assignmentService.ts's toAssignment reads
    // them through `toMillis = value instanceof Timestamp ? value.toMillis() : 0`.
    // Writing plain numbers here made every seeded assignment resolve to
    // createdAt = 0 in the app, which silently collapsed the Phase 44B
    // ordering test: with all candidates tied at 0, selectMostRecentIntervention
    // fell through to its `id.localeCompare` tiebreak and picked the OLDEST
    // explicit intervention, while the UI showed an identical title either way.
    createdAt: ts(seed.createdAt),
    updatedAt: ts(seed.createdAt),
    interventionOf: seed.interventionOf,
  });

  const completedAt = seed.createdAt + 2 * DAY_MS;
  await db
    .collection("assignments")
    .doc(seed.id)
    .collection("submissions")
    .doc(seed.studentUid)
    .set({
      studentId: seed.studentUid,
      completedQuestionIds: seed.questionIds,
      completedCount: seed.questionIds.length,
      startedAt: seed.createdAt + 1 * DAY_MS,
      lastCompletedAt: completedAt,
      completedAt,
      questionOutcomes: seed.frozenOutcomes,
    });
}

async function seedAssignmentsAndAttribution(): Promise<void> {
  const studentA = STUDENTS[0].uid;
  const studentB = STUDENTS[1].uid;
  const studentC = STUDENTS[2].uid;
  const studentE = STUDENTS[4].uid;
  const studentF = STUDENTS[5].uid;

  // --- Phase 44B: explicit-attribution ordering, on Student A -----------
  // (1) first explicit intervention, (2) a NEWER ordinary assignment for
  // the same student/topic with no marker, (3) a second, newest explicit
  // intervention. selectMostRecentIntervention must land on (3), never (2).
  await seedAssignment({
    id: "demo-a-intervention-1", studentUid: studentA,
    interventionOf: { subject: SUBJECT, topic: TOPIC },
    createdAt: NOW - 20 * DAY_MS,
    questionIds: [Q_INT_1], frozenOutcomes: { [Q_INT_1]: "struggled" },
  });
  await seedAssignment({
    id: "demo-a-ordinary-1", studentUid: studentA,
    interventionOf: null,
    createdAt: NOW - 10 * DAY_MS,
    questionIds: [Q_HEAVY, Q_LIGHT], frozenOutcomes: { [Q_HEAVY]: "struggled", [Q_LIGHT]: "solved" },
  });
  await seedAssignment({
    id: "demo-a-intervention-2", studentUid: studentA,
    interventionOf: { subject: SUBJECT, topic: TOPIC },
    createdAt: NOW - 5 * DAY_MS,
    questionIds: [Q_INT_2], frozenOutcomes: { [Q_INT_2]: "struggled" },
  });

  // --- Legacy-fallback: Student C has ONLY a marker-less assignment, no
  // explicit intervention candidate at all — selectMostRecentIntervention
  // must fall back to the legacy "most recent, period" heuristic.
  await seedAssignment({
    id: "demo-c-legacy-1", studentUid: studentC,
    interventionOf: null,
    createdAt: NOW - 15 * DAY_MS,
    questionIds: [Q_HEAVY], frozenOutcomes: { [Q_HEAVY]: "solved" },
  });

  // --- Student B: intervention effectiveness = improved -----------------
  // Frozen (at intervention): struggled on 2/3 => previousState =
  // persistent_struggle. Live study items (below): now solved + standing
  // success, knownOutcomeCount >= 3 => currentState = stable/recovering,
  // reviewedSinceCount >= 3 => high confidence, currentRank > previousRank
  // => "improved".
  const bInterventionAt = NOW - 14 * DAY_MS;
  await seedAssignment({
    id: "demo-b-intervention-1", studentUid: studentB,
    interventionOf: { subject: SUBJECT, topic: TOPIC },
    createdAt: bInterventionAt,
    questionIds: [Q_INT_1, Q_INT_2, Q_INT_3],
    frozenOutcomes: { [Q_INT_1]: "struggled", [Q_INT_2]: "struggled", [Q_INT_3]: "solved" },
  });

  // --- Student E: intervention effectiveness = no_change ----------------
  // Frozen: struggled on 2/3 => previousState = persistent_struggle. Live
  // items (below): still struggledCount >= 2, lastOutcome "struggled" =>
  // currentState = persistent_struggle too => same rank => "no_change".
  const eInterventionAt = NOW - 14 * DAY_MS;
  await seedAssignment({
    id: "demo-e-intervention-1", studentUid: studentE,
    interventionOf: { subject: SUBJECT, topic: TOPIC },
    createdAt: eInterventionAt,
    questionIds: [Q_INT_1, Q_INT_2, Q_INT_3],
    frozenOutcomes: { [Q_INT_1]: "struggled", [Q_INT_2]: "struggled", [Q_INT_3]: "solved" },
  });

  // --- Student F: intervention effectiveness = worsened -----------------
  // Frozen: all solved, 0 struggled, 3 outcomes => previousState = stable.
  // Live items (below): now struggledCount >= 2, lastOutcome "struggled"
  // and not standing => currentState = persistent_struggle => lower rank
  // => "worsened".
  const fInterventionAt = NOW - 14 * DAY_MS;
  await seedAssignment({
    id: "demo-f-intervention-1", studentUid: studentF,
    interventionOf: { subject: SUBJECT, topic: TOPIC },
    createdAt: fInterventionAt,
    questionIds: [Q_INT_1, Q_INT_2, Q_INT_3],
    frozenOutcomes: { [Q_INT_1]: "solved", [Q_INT_2]: "solved", [Q_INT_3]: "solved" },
  });

  // Live post-intervention study items for B/E/F (reviewed AFTER their
  // interventionAt, which is what makes reviewedSinceCount > 0).
  const postReviewAt = (interventionAt: number) => interventionAt + 5 * DAY_MS;
  const liveItems: StudyItemSeed[] = [
    // B: recovered — solved, standing success, full known history.
    { studentUid: studentB, questionId: Q_INT_1, status: "review", lastOutcome: "solved", intervalDays: 4, successfulReviews: 2, attemptCount: 4, lastReviewedAt: postReviewAt(bInterventionAt), nextReviewAt: NOW + 4 * DAY_MS, solvedCount: 3, struggledCount: 1, againCount: 0 },
    { studentUid: studentB, questionId: Q_INT_2, status: "review", lastOutcome: "solved", intervalDays: 4, successfulReviews: 2, attemptCount: 3, lastReviewedAt: postReviewAt(bInterventionAt), nextReviewAt: NOW + 4 * DAY_MS, solvedCount: 3, struggledCount: 0, againCount: 0 },
    { studentUid: studentB, questionId: Q_INT_3, status: "review", lastOutcome: "solved", intervalDays: 4, successfulReviews: 2, attemptCount: 2, lastReviewedAt: postReviewAt(bInterventionAt), nextReviewAt: NOW + 4 * DAY_MS, solvedCount: 2, struggledCount: 0, againCount: 0 },

    // E: unchanged — still struggling repeatedly, no standing recovery.
    { studentUid: studentE, questionId: Q_INT_1, status: "learning", lastOutcome: "struggled", intervalDays: 1, successfulReviews: 0, attemptCount: 5, lastReviewedAt: postReviewAt(eInterventionAt), nextReviewAt: NOW + 1 * DAY_MS, solvedCount: 1, struggledCount: 4, againCount: 0 },
    { studentUid: studentE, questionId: Q_INT_2, status: "learning", lastOutcome: "struggled", intervalDays: 1, successfulReviews: 0, attemptCount: 4, lastReviewedAt: postReviewAt(eInterventionAt), nextReviewAt: NOW + 1 * DAY_MS, solvedCount: 1, struggledCount: 3, againCount: 0 },
    { studentUid: studentE, questionId: Q_INT_3, status: "review", lastOutcome: "solved", intervalDays: 4, successfulReviews: 1, attemptCount: 3, lastReviewedAt: postReviewAt(eInterventionAt), nextReviewAt: NOW + 4 * DAY_MS, solvedCount: 3, struggledCount: 0, againCount: 0 },

    // F: was fine at intervention time, now struggling — a real regression.
    { studentUid: studentF, questionId: Q_INT_1, status: "learning", lastOutcome: "struggled", intervalDays: 1, successfulReviews: 0, attemptCount: 5, lastReviewedAt: postReviewAt(fInterventionAt), nextReviewAt: NOW + 1 * DAY_MS, solvedCount: 1, struggledCount: 4, againCount: 0 },
    { studentUid: studentF, questionId: Q_INT_2, status: "learning", lastOutcome: "struggled", intervalDays: 1, successfulReviews: 0, attemptCount: 4, lastReviewedAt: postReviewAt(fInterventionAt), nextReviewAt: NOW + 1 * DAY_MS, solvedCount: 1, struggledCount: 3, againCount: 0 },
    { studentUid: studentF, questionId: Q_INT_3, status: "learning", lastOutcome: "struggled", intervalDays: 1, successfulReviews: 0, attemptCount: 3, lastReviewedAt: postReviewAt(fInterventionAt), nextReviewAt: NOW + 1 * DAY_MS, solvedCount: 0, struggledCount: 3, againCount: 0 },
  ];

  const batch = db.batch();
  for (const item of liveItems) {
    batch.set(
      db.collection("users").doc(item.studentUid).collection("studyItems").doc(item.questionId),
      studyItemDoc(item),
    );
  }
  await batch.commit();

  console.log(
    "[seedDemoFixtures] seeded 6 assignments (A ×3 attribution-order, C ×1 legacy, B/E/F ×1 intervention each) " +
      `and ${liveItems.length} post-intervention study items (B/E/F).`,
  );
}

// ---------------------------------------------------------------------------
// 7 — VERIFICATION: read back what was written and fail loudly if it
// doesn't match what the fixture claims. "Write succeeded" is not proof of
// a valid fixture on its own (§15 of the brief).
// ---------------------------------------------------------------------------

async function verify(): Promise<void> {
  const failures: string[] = [];

  for (const uid of [TEACHER.uid, ...STUDENTS.map((s) => s.uid)]) {
    const record = await auth.getUser(uid).catch(() => null);
    if (!record) failures.push(`Auth user missing: ${uid}`);
    const profile = await db.collection("users").doc(uid).get();
    if (!profile.exists) failures.push(`users/${uid} missing`);
  }

  const cls = await db.collection("classes").doc(CLASS_ID).get();
  if (!cls.exists) failures.push(`classes/${CLASS_ID} missing`);
  const teacherMember = await db.collection("classes").doc(CLASS_ID).collection("members").doc(TEACHER.uid).get();
  if (!teacherMember.exists || teacherMember.data()?.role !== "teacher") {
    failures.push(`classes/${CLASS_ID}/members/${TEACHER.uid} missing or wrong role`);
  }
  for (const student of STUDENTS) {
    const member = await db.collection("classes").doc(CLASS_ID).collection("members").doc(student.uid).get();
    if (!member.exists || member.data()?.role !== "student") {
      failures.push(`classes/${CLASS_ID}/members/${student.uid} missing or wrong role`);
    }
  }

  // Student A: Q-heavy must show more struggle than Q-light.
  const heavy = await db.collection("users").doc(STUDENTS[0].uid).collection("studyItems").doc(Q_HEAVY).get();
  const light = await db.collection("users").doc(STUDENTS[0].uid).collection("studyItems").doc(Q_LIGHT).get();
  if (!heavy.exists || !light.exists) failures.push("Student A study items missing");
  else if ((heavy.data()?.struggledCount ?? 0) <= (light.data()?.struggledCount ?? 0)) {
    failures.push("Student A: Q-heavy struggledCount is not greater than Q-light's");
  }

  // Student D: counters must be genuinely absent (legacy), never present as 0.
  const legacy = await db.collection("users").doc(STUDENTS[3].uid).collection("studyItems").doc(Q_HEAVY).get();
  if (!legacy.exists) failures.push("Student D study item missing");
  else if (legacy.data()?.solvedCount !== undefined || legacy.data()?.struggledCount !== undefined) {
    failures.push("Student D: counters are present (should be genuinely absent for a legacy item)");
  }

  // Phase 44B: explicit-attribution ordering.
  const int1 = await db.collection("assignments").doc("demo-a-intervention-1").get();
  const ordinary = await db.collection("assignments").doc("demo-a-ordinary-1").get();
  const int2 = await db.collection("assignments").doc("demo-a-intervention-2").get();
  if (!int1.exists || !ordinary.exists || !int2.exists) failures.push("Student A attribution-order assignments missing");
  else {
    if (int1.data()?.interventionOf === null) failures.push("demo-a-intervention-1 should carry interventionOf");
    if (ordinary.data()?.interventionOf !== null) failures.push("demo-a-ordinary-1 must NOT carry interventionOf");
    if (int2.data()?.interventionOf === null) failures.push("demo-a-intervention-2 should carry interventionOf");
    if (!((int2.data()?.createdAt as number) > (ordinary.data()?.createdAt as number))) {
      failures.push("demo-a-intervention-2 must be newer than demo-a-ordinary-1 for the ordering test to be meaningful");
    }
  }

  const legacyAssignment = await db.collection("assignments").doc("demo-c-legacy-1").get();
  if (!legacyAssignment.exists) failures.push("demo-c-legacy-1 missing");
  else if (legacyAssignment.data()?.interventionOf !== null) failures.push("demo-c-legacy-1 must have interventionOf === null");

  // Effectiveness inputs exist for B/E/F.
  for (const [id, uid] of [
    ["demo-b-intervention-1", STUDENTS[1].uid],
    ["demo-e-intervention-1", STUDENTS[4].uid],
    ["demo-f-intervention-1", STUDENTS[5].uid],
  ] as const) {
    const assignment = await db.collection("assignments").doc(id).get();
    const submission = await db.collection("assignments").doc(id).collection("submissions").doc(uid).get();
    if (!assignment.exists || !submission.exists) failures.push(`${id} assignment/submission incomplete`);
  }

  if (failures.length > 0) {
    console.error("[seedDemoFixtures] VERIFICATION FAILED:");
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log("[seedDemoFixtures] verification passed — all fixture reads matched expectations.");
}

// ---------------------------------------------------------------------------
// 8 — MANIFEST
// ---------------------------------------------------------------------------

function printManifest(): void {
  console.log("\nDEMO FIXTURES READY\n");
  console.log(`Teacher:\n  ${TEACHER.uid} (${TEACHER.email})\n`);
  for (const student of STUDENTS) {
    console.log(`${student.displayName} (${student.uid}):\n  Purpose: ${student.purpose}\n`);
  }
  console.log(`Class:\n  ${CLASS_ID} — "${CLASS_NAME}" (join code ${CLASS_JOIN_CODE})\n`);
  console.log(`Key questions:\n  Q-heavy: ${Q_HEAVY}\n  Q-light: ${Q_LIGHT}\n  Q-intervention: ${Q_INT_1}, ${Q_INT_2}, ${Q_INT_3}\n`);
  console.log(
    `Emulator-only test password for every seeded account: ${DEMO_PASSWORD} (Auth emulator only — never valid outside it)\n`,
  );
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  await seedQuestions();
  await seedIdentities();
  await seedClass();
  await seedStudyItems();
  await seedLearningEvents();
  await seedAssignmentsAndAttribution();
  await verify();
  printManifest();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seedDemoFixtures] FAILED:", err);
    process.exit(1);
  });
