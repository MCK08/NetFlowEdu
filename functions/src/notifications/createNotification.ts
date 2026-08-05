import { FieldValue } from "firebase-admin/firestore";
import type { DocumentReference, Firestore, Transaction } from "firebase-admin/firestore";

import { buildNotificationDedupeKey } from "./dedupeKey";
import { applyNotificationMetaDelta, notificationMetaRef, readNotificationMeta } from "./notificationMeta";
import { NotificationEntityType, NotificationType } from "./notificationTypes";

// THE single place notification documents are created/deleted from. Every
// call site listed in the Phase 15 report goes through this file — no
// second copy of the self-notification guard, the dedupe check, or the
// unread-count maintenance exists anywhere else.
//
// Client can never call this: it lives in functions/src and is only ever
// invoked from inside an existing, already-audited backend transaction
// (a callable's own tx, or a trigger's own short-lived tx) — see
// firestore.rules' users/{uid}/notifications/{id} `allow create: if false`.
//
// ---------------------------------------------------------------------------
// PRODUCTION INCIDENT (2026-08-05) — read-before-write ordering
//
// Firestore transactions require EVERY read to happen before ANY write.
// The original Phase 15 API was a single `createNotificationInTransaction`
// that both read (actor snapshot, existing-notification dedupe check,
// unread summary) and wrote. Every call site invoked it AFTER its own
// writes were already staged — e.g. sendFriendRequest staged the
// friendship doc + both socialMeta deltas first — so the helper's first
// internal `tx.get` threw:
//
//   Error: Firestore transactions require all reads to be executed
//          before all writes.
//     at getActorSnapshot (lib/notifications/createNotification.js:17)
//     at lib/friends/sendFriendRequest.js:48
//
// That escaped as an unhandled error, surfacing to the client as a bare
// `internal` HttpsError and the generic "Bir şeyler ters gitti" message.
// It broke EVERY notification-producing action in production (friend
// requests, accepts, question/answer likes, answers, comments, class
// joins) — not just one role combination. The in-memory Firestore fake
// used by the unit tests does not model this rule, which is why the tests
// stayed green.
//
// THE FIX: the API is now split into an explicit two-phase shape —
// `prepareNotification` (reads only) and `commitNotification` (writes
// only). A caller physically cannot interleave them incorrectly without
// it being obvious at the call site, and the ordering requirement is now
// expressed in the type signatures rather than left to convention.
// ---------------------------------------------------------------------------

export interface ActorSnapshot {
  displayName: string;
  username: string | null;
  photoURL: string | null;
}

// READ PHASE. Reads a fresh actor snapshot from users/{uid} inside the
// caller's own transaction. Callers that already hold this data from an
// earlier read in the SAME transaction (e.g. joinClassByCode already reads
// the student's users/{uid} doc for its member row) pass it to
// prepareNotification directly instead of paying for a second read.
export async function getActorSnapshot(
  tx: Transaction,
  db: Firestore,
  actorId: string,
): Promise<ActorSnapshot> {
  const snap = await tx.get(db.collection("users").doc(actorId));
  const data = snap.data() ?? {};
  return {
    // Every field is normalized to a concrete value here — never
    // `undefined`, which Firestore rejects on write. A user with no
    // username/photoURL is completely normal (username is null until
    // setUsername succeeds) and must not be able to break an unrelated
    // friendship/like/comment action.
    displayName: typeof data.displayName === "string" ? data.displayName : "",
    username: typeof data.username === "string" ? data.username : null,
    photoURL: typeof data.photoURL === "string" ? data.photoURL : null,
  };
}

function notificationRef(db: Firestore, recipientId: string, dedupeKey: string): DocumentReference {
  return db.collection("users").doc(recipientId).collection("notifications").doc(dedupeKey);
}

export interface CreateNotificationParams {
  recipientId: string;
  actorId: string;
  // Optional: supplied when the caller already read the actor's user doc in
  // this transaction. Omitted means prepareNotification reads it itself.
  actorSnapshot?: ActorSnapshot;
  type: NotificationType;
  entityType: NotificationEntityType;
  entityId: string;
  parentEntityId?: string | null;
  classId?: string | null;
  messagePreview?: string | null;
}

// The writes a prepared notification will perform, or null for "nothing to
// do" (self-notification, or the notification already exists). Opaque to
// callers — they only pass it back to commitNotification.
export interface NotificationPlan {
  ref: DocumentReference;
  data: Record<string, unknown>;
  metaRef: DocumentReference;
  metaUnreadCount: number;
}

// READ PHASE — call this BEFORE any tx.set/tx.update/tx.delete in the
// enclosing transaction. Performs every read the notification needs and
// returns a plan; performs no writes at all.
//
// Idempotent by construction: the notification's document id IS its
// deterministic dedupe key (see dedupeKey.ts), so an already-existing
// notification resolves to a null plan — a retried delivery or repeated
// callable invocation never double-writes and never double-counts, and an
// existing document's isRead/readAt are never disturbed.
export async function prepareNotification(
  tx: Transaction,
  db: Firestore,
  params: CreateNotificationParams,
): Promise<NotificationPlan | null> {
  // A user never gets notified about their own action (liking your own
  // question, joining your own class link, etc.). Checked here, once, so
  // no call site has to remember it.
  if (params.actorId === params.recipientId) return null;

  const dedupeKey = buildNotificationDedupeKey({
    recipientId: params.recipientId,
    type: params.type,
    actorId: params.actorId,
    entityId: params.entityId,
  });
  const ref = notificationRef(db, params.recipientId, dedupeKey);

  const existing = await tx.get(ref);
  if (existing.exists) return null;

  const actorSnapshot = params.actorSnapshot ?? (await getActorSnapshot(tx, db, params.actorId));

  const metaRef = notificationMetaRef(db, params.recipientId);
  const meta = await readNotificationMeta(tx, metaRef);

  return {
    ref,
    metaRef,
    metaUnreadCount: meta.unreadCount,
    data: {
      recipientId: params.recipientId,
      actorId: params.actorId,
      actorDisplayName: actorSnapshot.displayName,
      actorUsername: actorSnapshot.username,
      actorPhotoURL: actorSnapshot.photoURL,
      type: params.type,
      entityType: params.entityType,
      entityId: params.entityId,
      parentEntityId: params.parentEntityId ?? null,
      classId: params.classId ?? null,
      messagePreview: params.messagePreview ?? null,
      createdAt: FieldValue.serverTimestamp(),
      readAt: null,
      isRead: false,
      dedupeKey,
    },
  };
}

// WRITE PHASE — safe to call at any point after the enclosing transaction's
// reads are done. A null plan is a no-op.
export function commitNotification(tx: Transaction, plan: NotificationPlan | null): void {
  if (!plan) return;
  tx.set(plan.ref, plan.data);
  applyNotificationMetaDelta(tx, plan.metaRef, { unreadCount: plan.metaUnreadCount }, 1);
}

export interface DeleteNotificationParams {
  recipientId: string;
  actorId: string;
  type: NotificationType;
  entityId: string;
}

export interface NotificationDeletionPlan {
  ref: DocumentReference;
  // Present only when the notification being removed was still unread —
  // a notification the recipient had already read must not decrement the
  // unread counter a second time.
  metaRef: DocumentReference | null;
  metaUnreadCount: number;
}

// READ PHASE for the un-like counterpart — used only by the two like
// toggles, where "no longer true" (I unliked it) means the notification
// about it disappears too. Same two-phase contract as above.
export async function prepareNotificationDeletion(
  tx: Transaction,
  db: Firestore,
  params: DeleteNotificationParams,
): Promise<NotificationDeletionPlan | null> {
  if (params.actorId === params.recipientId) return null;

  const dedupeKey = buildNotificationDedupeKey({
    recipientId: params.recipientId,
    type: params.type,
    actorId: params.actorId,
    entityId: params.entityId,
  });
  const ref = notificationRef(db, params.recipientId, dedupeKey);

  const existing = await tx.get(ref);
  if (!existing.exists) return null;

  const wasUnread = existing.data()?.isRead !== true;
  if (!wasUnread) return { ref, metaRef: null, metaUnreadCount: 0 };

  const metaRef = notificationMetaRef(db, params.recipientId);
  const meta = await readNotificationMeta(tx, metaRef);
  return { ref, metaRef, metaUnreadCount: meta.unreadCount };
}

// WRITE PHASE for the un-like counterpart. A null plan is a no-op.
export function commitNotificationDeletion(
  tx: Transaction,
  plan: NotificationDeletionPlan | null,
): void {
  if (!plan) return;
  tx.delete(plan.ref);
  if (plan.metaRef) {
    applyNotificationMetaDelta(tx, plan.metaRef, { unreadCount: plan.metaUnreadCount }, -1);
  }
}
