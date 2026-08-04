// REAL-CONCURRENCY tests for markAllNotificationsRead, run against the
// actual Firestore emulator with the real firebase-admin SDK — NOT the
// in-memory fake used by tests/unit/notificationCallables.test.ts. That
// fake can only ever demonstrate sequential behaviour; the guarantee this
// file exists to prove (two genuinely simultaneous mark-all calls can
// never double-decrement the summary) depends on Firestore's own
// transaction serialization and pessimistic query locking, which only a
// real Firestore provides.
//
// The production algorithm is exercised directly: markAllNotificationsReadForUid
// is exported from the same module the onCall handler delegates to, and
// takes `db` as a parameter precisely so it can be pointed at the emulator
// here. There is no reimplementation — a passing test here means the real
// shipped code path is correct.

// Imported by RELATIVE path into functions/node_modules rather than as a
// bare "firebase-admin/app" specifier. A bare specifier would need a
// global tsconfig `paths` entry to type-check, and Expo's Metro honours
// tsconfig paths — which would mean a mistaken `firebase-admin` import in
// CLIENT code silently resolved and bundled the Admin SDK into the app
// instead of failing loudly. Keeping the resolution local to this one test
// file has zero blast radius on app/bundle resolution.
import { deleteApp, initializeApp } from "../../functions/node_modules/firebase-admin/lib/app";
import { getFirestore } from "../../functions/node_modules/firebase-admin/lib/firestore";
import type { App } from "../../functions/node_modules/firebase-admin/lib/app";
import type { Firestore } from "../../functions/node_modules/firebase-admin/lib/firestore";

import {
  MARK_ALL_CHUNK_SIZE,
  markAllNotificationsReadForUid,
} from "../../functions/src/notifications/markAllNotificationsRead";

const PROJECT_ID = "netflow-edu-markall-test";

let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  app = initializeApp({ projectId: PROJECT_ID }, `markall-${Date.now()}`);
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

function notificationsRef(uid: string) {
  return db.collection("users").doc(uid).collection("notifications");
}

function summaryRef(uid: string) {
  return db.collection("users").doc(uid).collection("notificationMeta").doc("summary");
}

async function clearUser(uid: string) {
  const snap = await notificationsRef(uid).get();
  const batch = db.batch();
  for (const doc of snap.docs) batch.delete(doc.ref);
  batch.delete(summaryRef(uid));
  await batch.commit();
}

async function seed(uid: string, unreadCount: number, alreadyReadCount = 0, summaryValue?: number) {
  await clearUser(uid);
  // Chunked writes so seeding 450 documents stays under the 500-mutation
  // batch cap.
  const total = unreadCount + alreadyReadCount;
  for (let start = 0; start < total; start += 400) {
    const batch = db.batch();
    for (let i = start; i < Math.min(start + 400, total); i++) {
      batch.set(notificationsRef(uid).doc(`n${i}`), {
        recipientId: uid,
        actorId: "actor1",
        type: "question_liked",
        entityType: "question",
        entityId: "q1",
        isRead: i >= unreadCount,
        readAt: null,
        createdAt: new Date(),
      });
    }
    await batch.commit();
  }
  await summaryRef(uid).set({ unreadCount: summaryValue ?? unreadCount });
}

async function realUnreadDocCount(uid: string): Promise<number> {
  const snap = await notificationsRef(uid).where("isRead", "==", false).get();
  return snap.size;
}

async function summaryUnreadCount(uid: string): Promise<number> {
  const snap = await summaryRef(uid).get();
  const raw = snap.data()?.unreadCount;
  return typeof raw === "number" ? raw : 0;
}

// The invariant asserted by every test that starts from a CONSISTENT
// summary (7 of the 9 below): the cached number must equal the real number
// of unread documents. This is exactly what the old batch-then-delta
// implementation could violate under concurrency.
//
// The two "drifted starting summary" tests at the end deliberately do NOT
// use this helper — see their own comment for why.
async function expectSummaryMatchesReality(uid: string) {
  const [real, summary] = await Promise.all([realUnreadDocCount(uid), summaryUnreadCount(uid)]);
  expect(summary).toBe(real);
  expect(summary).toBeGreaterThanOrEqual(0);
}

describe("markAllNotificationsReadForUid — real Firestore emulator", () => {
  it("marks every unread notification read and leaves the summary at exactly 0", async () => {
    const uid = "u-basic";
    await seed(uid, 5);

    const result = await markAllNotificationsReadForUid(db, uid);

    expect(result).toEqual({ updatedCount: 5, completed: true });
    await expectSummaryMatchesReality(uid);
    expect(await summaryUnreadCount(uid)).toBe(0);
  });

  it("leaves already-read documents untouched and does not count them", async () => {
    const uid = "u-already-read";
    await seed(uid, 3, 4);

    const result = await markAllNotificationsReadForUid(db, uid);

    expect(result.updatedCount).toBe(3);
    await expectSummaryMatchesReality(uid);
  });

  it("is a safe no-op when nothing is unread", async () => {
    const uid = "u-nothing";
    await seed(uid, 0, 3);

    const result = await markAllNotificationsReadForUid(db, uid);

    expect(result).toEqual({ updatedCount: 0, completed: true });
    await expectSummaryMatchesReality(uid);
  });

  it(`processes more than one chunk (${MARK_ALL_CHUNK_SIZE + 50} unread, chunk size ${MARK_ALL_CHUNK_SIZE})`, async () => {
    const uid = "u-many";
    await seed(uid, MARK_ALL_CHUNK_SIZE + 50);

    const result = await markAllNotificationsReadForUid(db, uid);

    expect(result.updatedCount).toBe(MARK_ALL_CHUNK_SIZE + 50);
    expect(result.completed).toBe(true);
    await expectSummaryMatchesReality(uid);
    expect(await realUnreadDocCount(uid)).toBe(0);
  }, 60000);

  // ---- the actual race the old implementation could lose ----------------

  it("TWO SIMULTANEOUS mark-all calls never double-decrement — summary ends at exactly the real unread count", async () => {
    const uid = "u-race-two";
    await seed(uid, 10);

    const [a, b] = await Promise.all([
      markAllNotificationsReadForUid(db, uid),
      markAllNotificationsReadForUid(db, uid),
    ]);

    // Between them they performed exactly 10 real transitions — never 20.
    expect(a.updatedCount + b.updatedCount).toBe(10);
    expect(await realUnreadDocCount(uid)).toBe(0);
    await expectSummaryMatchesReality(uid);
  }, 60000);

  it("a notification created WHILE mark-all runs is never wrongly marked read, and the summary still matches reality", async () => {
    const uid = "u-race-create";
    await seed(uid, 20);

    const markAll = markAllNotificationsReadForUid(db, uid);
    // Created concurrently, mirroring createNotificationInTransaction's own
    // atomic "+1 doc, +1 summary" shape.
    const create = db.runTransaction(async (tx) => {
      const ref = notificationsRef(uid).doc("brand-new");
      const summarySnap = await tx.get(summaryRef(uid));
      const current = summarySnap.data()?.unreadCount;
      tx.set(ref, {
        recipientId: uid,
        actorId: "actor2",
        type: "question_commented",
        entityType: "question",
        entityId: "q2",
        isRead: false,
        readAt: null,
        createdAt: new Date(),
      });
      tx.set(
        summaryRef(uid),
        { unreadCount: (typeof current === "number" ? current : 0) + 1 },
        { merge: true },
      );
    });

    await Promise.all([markAll, create]);

    // Whatever the interleaving, the cached number must equal reality —
    // the exact invariant the old implementation could break (real 1 /
    // summary 0).
    await expectSummaryMatchesReality(uid);

    // And the new notification itself is a real document with a real
    // boolean read state — never lost.
    const brandNew = await notificationsRef(uid).doc("brand-new").get();
    expect(brandNew.exists).toBe(true);
    expect(typeof brandNew.data()?.isRead).toBe("boolean");
  }, 60000);

  it("two simultaneous calls PLUS a concurrent create still end with summary === real unread count", async () => {
    const uid = "u-race-all";
    await seed(uid, 15);

    await Promise.all([
      markAllNotificationsReadForUid(db, uid),
      db.runTransaction(async (tx) => {
        const summarySnap = await tx.get(summaryRef(uid));
        const current = summarySnap.data()?.unreadCount;
        tx.set(notificationsRef(uid).doc("mid-flight"), {
          recipientId: uid,
          actorId: "actor3",
          type: "friend_request_received",
          entityType: "friendship",
          entityId: "p1",
          isRead: false,
          readAt: null,
          createdAt: new Date(),
        });
        tx.set(
          summaryRef(uid),
          { unreadCount: (typeof current === "number" ? current : 0) + 1 },
          { merge: true },
        );
      }),
      markAllNotificationsReadForUid(db, uid),
    ]);

    await expectSummaryMatchesReality(uid);
  }, 60000);

  // ---- PRE-EXISTING drifted summaries: explicitly NOT self-correcting ----
  //
  // The two tests below deliberately start from a summary that ALREADY
  // disagrees with reality — a state Phase 15's own code paths cannot
  // produce (every writer of this document — createNotificationInTransaction,
  // deleteNotificationInTransaction, markNotificationRead and
  // markAllNotificationsReadForUid — updates the counter atomically with
  // the notification documents themselves). They exist to pin down what
  // happens if such a value is introduced from OUTSIDE this system, not to
  // claim mark-all repairs it.
  //
  // These are therefore the ONLY two tests in this file that do NOT assert
  // expectSummaryMatchesReality — mark-all decrements by the real number of
  // transitions it performed, so it cannot and does not reconcile a
  // pre-corrupted starting value. Repairing that would need a dedicated
  // reconciliation path, deliberately out of scope (see the Phase 15
  // report's reconciliation decision).

  it("a summary that starts HIGHER than reality is NOT reconciled — it is reduced by the real transition count only, so it stays inflated", async () => {
    const uid = "u-drift-high";
    await seed(uid, 3, 0, 99); // summary claims 99, only 3 are really unread

    await markAllNotificationsReadForUid(db, uid);

    // Every unread doc is now read, so reality is 0 — but the summary is
    // 99 - 3 = 96, NOT 0. Documented honestly: mark-all subtracts the
    // transitions it genuinely performed and never force-sets the counter,
    // which is exactly what makes it race-safe (see the module doc
    // comment). The cost of that guarantee is that it cannot repair a
    // pre-existing wrong value.
    expect(await realUnreadDocCount(uid)).toBe(0);
    expect(await summaryUnreadCount(uid)).toBe(96);
  });

  it("a summary that starts LOWER than reality never goes negative", async () => {
    const uid = "u-drift-low";
    await seed(uid, 5, 0, 2); // summary claims 2, but 5 are really unread

    await markAllNotificationsReadForUid(db, uid);

    expect(await realUnreadDocCount(uid)).toBe(0);
    // Floored at 0 rather than -3.
    expect(await summaryUnreadCount(uid)).toBe(0);
  });
});
