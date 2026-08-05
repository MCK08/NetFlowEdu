import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import { applyNotificationMetaDelta, notificationMetaRef, readNotificationMeta } from "./notificationMeta";

// PRE-COMMIT HARDENING FIX: the original single-notification "mark read"
// was a plain client updateDoc({isRead, readAt}) — firestore.rules allowed
// it, but NOTHING anywhere (no trigger, no callable, no reconciliation)
// ever decremented notificationMeta/summary.unreadCount in response. The
// bell badge only ever appeared to update because its count comes from a
// live listener on that same summary document — which a client update to
// the notification doc never touches. Reading a notification therefore
// never actually lowered the real unread count; a fresh app load (a new
// listener attach reading the same never-changed summary) or a second
// device would keep showing the stale, too-high number forever. This
// callable is the fix: it is now the ONLY way a single notification is
// marked read (see firestore.rules — client update is now fully denied),
// so the summary decrement is atomic with the isRead flip, every time.
export const markNotificationRead = onCall<{ notificationId: string }>(
  { region: "us-central1" },
  async (request): Promise<{ alreadyRead: boolean }> => {
    const caller = request.auth;
    if (!caller) {
      throw new HttpsError("unauthenticated", "Bu işlem için giriş yapmanız gerekiyor.");
    }

    const notificationId = request.data?.notificationId;
    if (typeof notificationId !== "string" || notificationId.length === 0) {
      throw new HttpsError("invalid-argument", "Geçersiz bildirim kimliği.");
    }

    const db = getFirestore();
    const ref = db.collection("users").doc(caller.uid).collection("notifications").doc(notificationId);
    const metaRef = notificationMetaRef(db, caller.uid);

    // Everything below happens in ONE transaction — the isRead flip and
    // the summary decrement can never observably happen one without the
    // other, and Firestore's own transaction retry-on-contention is what
    // makes two concurrent calls for the SAME notification (double-tap,
    // two devices racing) decrement the counter exactly once: whichever
    // commits first flips isRead to true; the other's tx.get (retried by
    // the SDK after the conflicting commit) sees isRead already true and
    // takes the no-op branch below instead of decrementing a second time.
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        throw new HttpsError("not-found", "Bildirim bulunamadı.");
      }

      const data = snap.data() ?? {};
      // The notification's OWN recorded recipientId must match the caller
      // — not just "does this path belong to my uid", which the Admin SDK
      // read would satisfy regardless. Belt-and-suspenders with the path
      // itself (users/{caller.uid}/notifications/...) already scoping the
      // read to the caller's own subcollection.
      if (data.recipientId !== caller.uid) {
        throw new HttpsError("permission-denied", "Bu bildirime erişim izniniz yok.");
      }

      // Idempotent: an already-read notification is a silent no-op — the
      // exact case that, without this check, would decrement the counter
      // a second time for a notification that was never re-counted as
      // unread in the first place (double-tap, a retried network call, or
      // this same notification already marked read via a previous call).
      if (data.isRead === true) {
        return { alreadyRead: true };
      }

      // ---- READ PHASE (every read must precede every write) ----
      // Firestore rejects a read issued after the first write in a
      // transaction; the summary must therefore be read BEFORE the
      // isRead flip below, not after it.
      const meta = await readNotificationMeta(tx, metaRef);

      // ---- WRITE PHASE ----
      tx.update(ref, { isRead: true, readAt: FieldValue.serverTimestamp() });
      applyNotificationMetaDelta(tx, metaRef, meta, -1); // floored at 0 inside

      return { alreadyRead: false };
    });
  },
);
