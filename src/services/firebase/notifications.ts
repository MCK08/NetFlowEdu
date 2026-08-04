import {
  collection,
  doc,
  DocumentData,
  DocumentSnapshot,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  QueryDocumentSnapshot,
  startAfter,
  Timestamp,
  Unsubscribe,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { db, functions } from "./config";
import { NotificationRecord, NotificationType } from "@/types/notification";

function toMillis(value: Timestamp | number | null | undefined): number | null {
  if (value instanceof Timestamp) return value.toMillis();
  return typeof value === "number" ? value : null;
}

function toNotification(id: string, data: DocumentData): NotificationRecord {
  return {
    id,
    recipientId: data.recipientId ?? "",
    actorId: data.actorId ?? "",
    actorDisplayName: data.actorDisplayName ?? "",
    actorUsername: data.actorUsername ?? null,
    actorPhotoURL: data.actorPhotoURL ?? null,
    type: data.type as NotificationType,
    entityType: data.entityType ?? "question",
    entityId: data.entityId ?? "",
    parentEntityId: data.parentEntityId ?? null,
    classId: data.classId ?? null,
    messagePreview: data.messagePreview ?? null,
    createdAt: toMillis(data.createdAt) ?? 0,
    readAt: toMillis(data.readAt),
    isRead: data.isRead === true,
  };
}

export interface NotificationPage {
  notifications: NotificationRecord[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

// Plain getDocs pagination, not onSnapshot — the inbox's full history
// doesn't need to be a live-updating listener (Stage 13's "tek global
// listener sınırı" concern); only the unread badge below is realtime.
// Matches getOwnQuestionsPage's exact pagination shape.
export async function getNotificationsPage(
  uid: string,
  pageSize: number,
  cursor: DocumentSnapshot<DocumentData> | null,
): Promise<NotificationPage> {
  const constraints = [
    orderBy("createdAt", "desc"),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(pageSize),
  ];
  const snapshot = await getDocs(query(collection(db, "users", uid, "notifications"), ...constraints));
  const docs = snapshot.docs;
  return {
    notifications: docs.map((d) => toNotification(d.id, d.data())),
    cursor: docs.length > 0 ? (docs[docs.length - 1] as QueryDocumentSnapshot<DocumentData>) : null,
    hasMore: docs.length === pageSize,
  };
}

// One realtime listener per signed-in session — the ONLY notification
// listener this feature opens (the list itself is plain getDocs, see
// above). Cheap: a single-field summary document, not a collection scan.
export function subscribeToUnreadCount(
  uid: string,
  onChange: (count: number) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, "users", uid, "notificationMeta", "summary"),
    (snapshot) => {
      const raw = snapshot.data()?.unreadCount;
      onChange(typeof raw === "number" && raw > 0 ? raw : 0);
    },
    () => onChange(0),
  );
}

// Pre-commit hardening: this used to be a direct client updateDoc({isRead,
// readAt}) — firestore.rules allowed it, but nothing then reconciled
// notificationMeta/summary.unreadCount, so the badge silently went stale
// (see markNotificationRead.ts's own doc comment for the full incident).
// Client update access to this collection has been removed entirely;
// marking a single notification read is now exclusively this callable,
// which flips isRead/readAt AND decrements the summary counter atomically
// server-side. Safe to call repeatedly — idempotent (an already-read
// notification is a no-op, never double-decrements).
export async function markNotificationRead(notificationId: string): Promise<{ alreadyRead: boolean }> {
  const callable = httpsCallable<{ notificationId: string }, { alreadyRead: boolean }>(
    functions,
    "markNotificationRead",
  );
  const result = await callable({ notificationId });
  return result.data;
}

// Unbounded "mark everything read" goes through the Cloud Function — see
// its own doc comment for why this can't safely be a client-side loop.
export async function markAllNotificationsRead(): Promise<{ updatedCount: number }> {
  const callable = httpsCallable<undefined, { updatedCount: number }>(
    functions,
    "markAllNotificationsRead",
  );
  const result = await callable();
  return result.data;
}
