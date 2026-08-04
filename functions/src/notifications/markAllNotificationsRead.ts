import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";

import { applyNotificationMetaDelta, notificationMetaRef, readNotificationMeta } from "./notificationMeta";

// Each chunk is ONE transaction. 400 (not Firestore's hard 500 mutation
// cap) leaves headroom for the summary write plus retry overhead inside
// the same transaction.
export const MARK_ALL_CHUNK_SIZE = 400;

// Bounds the chunk loop so a pathological account (or a bug that somehow
// keeps producing unread documents faster than they're consumed) can never
// spin forever inside a single function invocation. 400 * 50 = 20,000
// notifications per call — far beyond any realistic inbox; hitting it is
// reported honestly as a partial result rather than silently truncated.
export const MARK_ALL_MAX_CHUNKS = 50;

export interface MarkAllResult {
  updatedCount: number;
  // False only when MARK_ALL_MAX_CHUNKS was exhausted with unread
  // notifications still remaining — the caller can simply invoke again
  // (this whole operation is idempotent), and the client surfaces nothing
  // special because the realtime summary listener already reflects the
  // real remaining count.
  completed: boolean;
}

// THE CORE ALGORITHM, exported separately from the onCall wrapper purely so
// it can be driven directly against a real Firestore instance (the
// emulator) in tests — `onCall(...).run()` cannot be pointed at an
// arbitrary Firestore, but this function takes `db` as a parameter, so the
// emulator tests exercise the EXACT production code path rather than a
// reimplementation. See tests/integration/markAllNotificationsRead.emulator.test.ts.
//
// Race-safety, and why the previous version was NOT production-safe:
//
//   The old implementation did (a) a plain query for unread docs, (b) a
//   batch write marking them read, then (c) a SEPARATE transaction that
//   decremented the summary by the number of docs step (b) had touched.
//   Between (a) and (c) nothing held a lock, so two concurrent calls could
//   both observe the same N unread documents, both mark them read
//   (idempotent at the document level — harmless), and then both subtract
//   N from the summary. With a genuinely new notification arriving in that
//   window, the real unread document count could be 1 while the summary
//   read 0 — and nothing self-heals that, because the realtime listener
//   watches the summary document, not the notification documents.
//
//   Now every chunk is a single transaction that:
//     1. queries unread docs — Transaction.get(query) takes a PESSIMISTIC
//        LOCK on every document it returns (documented Admin SDK
//        behaviour, verified against @google-cloud/firestore's own type
//        definitions), so a concurrent transaction cannot mark those same
//        documents read underneath this one;
//     2. reads the summary INSIDE the same transaction (so the summary is
//        part of the same consistent snapshot and the same conflict set);
//     3. counts only documents this transaction genuinely observed as
//        unread — the actual state transitions it is performing;
//     4. writes those documents AND the summary decrement together.
//
//   A conflicting concurrent transaction therefore fails and is retried by
//   the SDK against FRESH data, where those documents now read
//   isRead === true and are excluded from the `where("isRead","==",false)`
//   result entirely — so the retry counts them zero times. Double
//   decrement is impossible by construction, not by convention. A
//   notification created mid-loop is simply picked up by a later chunk (or
//   left correctly unread with its own +1 already applied by its own
//   creating transaction).
export async function markAllNotificationsReadForUid(
  db: Firestore,
  uid: string,
): Promise<MarkAllResult> {
  const notificationsRef = db.collection("users").doc(uid).collection("notifications");
  const metaRef = notificationMetaRef(db, uid);

  let updatedCount = 0;

  for (let chunk = 0; chunk < MARK_ALL_MAX_CHUNKS; chunk++) {
    const transitioned = await db.runTransaction(async (tx) => {
      // Deliberately unordered (no orderBy) — every unread document is
      // eligible regardless of order, so no composite index is required.
      const snap = await tx.get(
        notificationsRef.where("isRead", "==", false).limit(MARK_ALL_CHUNK_SIZE),
      );
      if (snap.empty) return 0;

      // ALL reads must precede ALL writes inside a Firestore transaction —
      // the summary read therefore happens here, before the loop below.
      const meta = await readNotificationMeta(tx, metaRef);

      const now = FieldValue.serverTimestamp();
      let realTransitions = 0;
      for (const doc of snap.docs) {
        // Re-check rather than trusting the query alone: this is the count
        // that drives the summary delta, so it must reflect genuine
        // unread -> read transitions only.
        if (doc.data()?.isRead === true) continue;
        tx.update(doc.ref, { isRead: true, readAt: now });
        realTransitions++;
      }

      if (realTransitions > 0) {
        applyNotificationMetaDelta(tx, metaRef, meta, -realTransitions); // floored at 0 inside
      }
      return realTransitions;
    });

    updatedCount += transitioned;
    // A chunk that transitioned nothing means there is genuinely no unread
    // work left (an empty query result, or every returned doc already
    // read) — stop rather than spinning.
    if (transitioned === 0) {
      return { updatedCount, completed: true };
    }
  }

  // Budget exhausted with work potentially remaining. Reported honestly;
  // calling again is always safe (fully idempotent).
  return { updatedCount, completed: false };
}

export const markAllNotificationsRead = onCall(
  { region: "us-central1" },
  async (request): Promise<MarkAllResult> => {
    const caller = request.auth;
    if (!caller) {
      throw new HttpsError("unauthenticated", "Bu işlem için giriş yapmanız gerekiyor.");
    }
    return markAllNotificationsReadForUid(getFirestore(), caller.uid);
  },
);
