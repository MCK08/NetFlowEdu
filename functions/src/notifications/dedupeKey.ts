import { NotificationType } from "./notificationTypes";

// Deterministic notification-document id, the SAME "canonical id instead of
// a query" pattern already used by buildLikeId/buildFriendshipPairId in
// this codebase. Using this as the actual Firestore document id (not just
// a field) is what makes notification creation naturally idempotent: a
// retried delivery (Cloud Functions triggers are at-least-once) or a
// repeated callable invocation always resolves to the SAME document, so
// createNotification only ever needs a single get-then-maybe-set, never a
// query, to detect "already created".
//
// One key per (recipient, type, actor, entity) tuple — a like/unlike/like
// cycle on the same target always reuses the exact same key, which is
// exactly what lets toggle-off delete the exact right document.
export function buildNotificationDedupeKey(params: {
  recipientId: string;
  type: NotificationType;
  actorId: string;
  entityId: string;
}): string {
  return [params.recipientId, params.type, params.actorId, params.entityId].join("_");
}
