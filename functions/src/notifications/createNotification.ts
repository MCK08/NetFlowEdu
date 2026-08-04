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

export interface ActorSnapshot {
  displayName: string;
  username: string | null;
  photoURL: string | null;
}

// Reads a fresh actor snapshot from users/{uid} inside the caller's own
// transaction. Callers that already hold this data from an earlier read in
// the SAME transaction (e.g. joinClassByCode already reads the student's
// users/{uid} doc for its member row) should pass that data directly to
// createNotificationInTransaction instead of calling this — this exists
// only for call sites that don't already have it (the like/comment/answer
// paths).
export async function getActorSnapshot(
  tx: Transaction,
  db: Firestore,
  actorId: string,
): Promise<ActorSnapshot> {
  const snap = await tx.get(db.collection("users").doc(actorId));
  const data = snap.data() ?? {};
  return {
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
  actorSnapshot: ActorSnapshot;
  type: NotificationType;
  entityType: NotificationEntityType;
  entityId: string;
  parentEntityId?: string | null;
  classId?: string | null;
  messagePreview?: string | null;
}

// Idempotent, atomic (runs inside the caller's transaction), and
// self-notification-safe. A retried delivery (Cloud Functions triggers are
// at-least-once) or a repeated callable call always resolves to the same
// deterministic document id (see dedupeKey.ts) — if it already exists this
// is a silent no-op that does NOT touch isRead/readAt on the existing
// document and does NOT double-increment the unread counter. This is also
// what makes it safe to call unconditionally from every wired call site
// without each one re-implementing "did I already do this".
export async function createNotificationInTransaction(
  tx: Transaction,
  db: Firestore,
  params: CreateNotificationParams,
): Promise<void> {
  // A user never gets notified about their own action (liking your own
  // question, joining your own class link, etc. — none of these are
  // reachable today, but this makes it impossible by construction rather
  // than by every call site remembering to check).
  if (params.actorId === params.recipientId) return;

  const dedupeKey = buildNotificationDedupeKey({
    recipientId: params.recipientId,
    type: params.type,
    actorId: params.actorId,
    entityId: params.entityId,
  });
  const ref = notificationRef(db, params.recipientId, dedupeKey);

  const existing = await tx.get(ref);
  if (existing.exists) return;

  tx.set(ref, {
    recipientId: params.recipientId,
    actorId: params.actorId,
    actorDisplayName: params.actorSnapshot.displayName,
    actorUsername: params.actorSnapshot.username,
    actorPhotoURL: params.actorSnapshot.photoURL,
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
  });

  const metaRef = notificationMetaRef(db, params.recipientId);
  const meta = await readNotificationMeta(tx, metaRef);
  applyNotificationMetaDelta(tx, metaRef, meta, 1);
}

export interface DeleteNotificationParams {
  recipientId: string;
  actorId: string;
  type: NotificationType;
  entityId: string;
}

// The un-like counterpart to createNotificationInTransaction — used only by
// the two like toggles, where "no longer true" (I unliked it) should mean
// the notification about it disappears too, same as the like itself
// disappearing. Deletes the exact same deterministic document a matching
// create call would have written. Decrements the unread counter only if
// the notification being removed was still unread (the recipient had
// already read-and-dismissed it, deleting it must not touch their unread
// count a second time).
export async function deleteNotificationInTransaction(
  tx: Transaction,
  db: Firestore,
  params: DeleteNotificationParams,
): Promise<void> {
  if (params.actorId === params.recipientId) return;

  const dedupeKey = buildNotificationDedupeKey({
    recipientId: params.recipientId,
    type: params.type,
    actorId: params.actorId,
    entityId: params.entityId,
  });
  const ref = notificationRef(db, params.recipientId, dedupeKey);

  const existing = await tx.get(ref);
  if (!existing.exists) return;

  const wasUnread = existing.data()?.isRead !== true;
  tx.delete(ref);

  if (wasUnread) {
    const metaRef = notificationMetaRef(db, params.recipientId);
    const meta = await readNotificationMeta(tx, metaRef);
    applyNotificationMetaDelta(tx, metaRef, meta, -1);
  }
}
