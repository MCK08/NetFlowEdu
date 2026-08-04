import { NotificationRecord } from "@/types/notification";

// Same overlapping-cursor-page problem as mergeFriendshipPages/
// mergeQuestionPages elsewhere in this app — appends, drops ids already
// present, never re-sorts (the query itself is already createdAt desc).
export function mergeNotificationPages(
  existing: NotificationRecord[],
  incoming: NotificationRecord[],
): NotificationRecord[] {
  if (incoming.length === 0) return existing;
  const seen = new Set(existing.map((n) => n.id));
  const merged = existing.slice();
  for (const notification of incoming) {
    if (seen.has(notification.id)) continue;
    seen.add(notification.id);
    merged.push(notification);
  }
  return merged;
}

// First-wins dedupe within a single list — guards duplicate React keys.
export function dedupeNotificationsById(notifications: NotificationRecord[]): NotificationRecord[] {
  const seen = new Set<string>();
  const out: NotificationRecord[] = [];
  for (const notification of notifications) {
    if (seen.has(notification.id)) continue;
    seen.add(notification.id);
    out.push(notification);
  }
  return out;
}

// Pure read-state transition — marks exactly one notification read in a
// list without touching any other entry, and is a no-op (returns the SAME
// array reference) if the target is missing or already read. Returning the
// identical reference on a no-op matters for the hook that calls this: it
// lets a caller skip a re-render when nothing actually changed, and makes
// double-tap / concurrent "mark read" calls trivially idempotent.
export function applyReadTransition(
  notifications: NotificationRecord[],
  notificationId: string,
  readAt: number,
): NotificationRecord[] {
  const index = notifications.findIndex((n) => n.id === notificationId);
  if (index === -1) return notifications;
  const target = notifications[index];
  if (!target || target.isRead) return notifications;

  const next = notifications.slice();
  next[index] = { ...target, isRead: true, readAt };
  return next;
}

// Same transition, applied to every entry at once — the local-state
// counterpart of the mark-all-read callable succeeding.
export function applyMarkAllReadTransition(
  notifications: NotificationRecord[],
  readAt: number,
): NotificationRecord[] {
  if (notifications.every((n) => n.isRead)) return notifications;
  return notifications.map((n) => (n.isRead ? n : { ...n, isRead: true, readAt }));
}

// Whether applyReadTransition would actually change anything — the same
// predicate applyReadTransition itself uses, exposed separately so a
// caller can decide (purely, BEFORE touching any state) whether an
// optimistic side effect like decrementing a badge is warranted. Calling
// this instead of inspecting applyReadTransition's return identity inside
// a React state updater is what keeps that updater pure: an impure updater
// is double-invoked under StrictMode and would decrement the badge twice
// for a single tap.
export function willTransitionToRead(
  notifications: NotificationRecord[],
  notificationId: string,
): boolean {
  const target = notifications.find((n) => n.id === notificationId);
  return target !== undefined && !target.isRead;
}

// Exact inverse of applyReadTransition — puts one notification back to
// unread, restoring its previous readAt. Used to roll back an optimistic
// mark-read when the callable actually failed, so the row does not lie
// about being read. A no-op (same array reference) if the id is unknown or
// the entry is already unread, so a duplicated rollback can never flip a
// legitimately-read notification back to unread.
export function revertReadTransition(
  notifications: NotificationRecord[],
  notificationId: string,
  previousReadAt: number | null,
): NotificationRecord[] {
  const index = notifications.findIndex((n) => n.id === notificationId);
  if (index === -1) return notifications;
  const target = notifications[index];
  if (!target || !target.isRead) return notifications;

  const next = notifications.slice();
  next[index] = { ...target, isRead: false, readAt: previousReadAt };
  return next;
}
