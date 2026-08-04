// Allowlist of notification types this backend can ACTUALLY produce today.
// Each type below is wired into exactly one real, already-audited backend
// action (see createNotification.ts call sites) — never speculative. In
// particular there is no generic "class_activity": the only real,
// provable class-side signal in this codebase is a student joining via
// joinClassByCode, so that is the one class notification type that exists
// (class_student_joined). A class announcement/broadcast feature does not
// exist anywhere in this app, so no such notification type is added.
export const NOTIFICATION_TYPES = [
  "question_answered",
  "question_liked",
  "answer_liked",
  "question_commented",
  "friend_request_received",
  "friend_request_accepted",
  "class_student_joined",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === "string" && (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

export type NotificationEntityType = "question" | "answer" | "friendship" | "class";

// Everything a notification document needs to render itself without a
// follow-up read — actor identity is a SNAPSHOT taken at creation time
// (never a live join), same trust/perf tradeoff publicProfiles already
// makes for likes/comments elsewhere in this app. A later profile edit
// does not retroactively change old notification text; that is
// intentional, not a bug.
export interface NotificationRecord {
  id: string;
  recipientId: string;
  actorId: string;
  actorDisplayName: string;
  actorUsername: string | null;
  actorPhotoURL: string | null;
  type: NotificationType;
  entityType: NotificationEntityType;
  entityId: string;
  // The question a like/answer/comment ultimately belongs to — present
  // only for answer_liked (where entityId is the answerId, not the
  // question), null for every other type.
  parentEntityId: string | null;
  // Present only for class_student_joined.
  classId: string | null;
  // Short denormalized text (e.g. a class name) — never a raw user-typed
  // question/answer/comment body, to keep this document small and to
  // avoid ever exposing moderation-sensitive content in a notification
  // preview.
  messagePreview: string | null;
  createdAt: number;
  readAt: number | null;
  isRead: boolean;
  // Deterministic id used as this document's own Firestore id — see
  // dedupeKey.ts. Kept as a field too so it round-trips in reads without
  // the caller needing to separately track "this doc's own id".
  dedupeKey: string;
}
