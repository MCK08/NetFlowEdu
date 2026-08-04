import { FieldValue } from "firebase-admin/firestore";
import type { DocumentReference, Firestore, Transaction } from "firebase-admin/firestore";

// users/{uid}/notificationMeta/summary — a single server-maintained counter
// document, the exact same shape/trust model as users/{uid}/socialMeta/summary
// (see functions/src/friends/socialMeta.ts). Chosen over either (a) a
// client-side onSnapshot listening to the whole notifications collection
// just to count unread docs — unbounded read cost, one more permanently-open
// listener per user, and (b) a live COUNT() aggregation query on every badge
// render — extra round-trip and still requires a composite index once
// combined with isRead ordering. A summary doc updated atomically inside the
// SAME transaction that creates/deletes a notification is free (one extra
// write in a transaction firestore.rules already gates as owner-only-read
// / never-client-written), race-free (transaction, not read-modify-write
// from the client), and correct across multiple signed-in devices (every
// device just reads the one document).
export interface NotificationMetaFields {
  unreadCount: number;
}

export function notificationMetaRef(db: Firestore, uid: string): DocumentReference {
  return db.collection("users").doc(uid).collection("notificationMeta").doc("summary");
}

// A user with no notifications yet (or created before this phase) has no
// summary doc — treated as zero, never as an error.
export async function readNotificationMeta(
  tx: Transaction,
  ref: DocumentReference,
): Promise<NotificationMetaFields> {
  const snap = await tx.get(ref);
  if (!snap.exists) return { unreadCount: 0 };
  const data = snap.data() ?? {};
  return { unreadCount: typeof data.unreadCount === "number" ? data.unreadCount : 0 };
}

// Floored at 0 — same reasoning as socialMeta.applyMetaDelta: a delivery
// race must never be able to drive the counter negative.
export function applyNotificationMetaDelta(
  tx: Transaction,
  ref: DocumentReference,
  current: NotificationMetaFields,
  delta: number,
): void {
  const next = Math.max(0, current.unreadCount + delta);
  tx.set(ref, { unreadCount: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}
