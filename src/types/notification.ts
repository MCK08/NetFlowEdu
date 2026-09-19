// Client-side mirror of functions/src/notifications/notificationTypes.ts —
// duplicated rather than imported, same reasoning as
// src/utils/onboardingStatus.ts's own doc comment: functions/ is a
// separate TypeScript project this app cannot import across. Both sides
// are exercised against the same fixed set of type strings (see
// tests/unit/notificationPresentation.test.ts), so they can't silently
// drift apart without a test catching it.
export const NOTIFICATION_TYPES = [
  "question_answered",
  "question_liked",
  "answer_liked",
  "question_commented",
  "friend_request_received",
  "friend_request_accepted",
  "class_student_joined",
  // Phase 99 — the author's own moderation outcome, addressed to the student
  // who submitted the content. Never names the reviewing teacher.
  "answer_review_approved",
  "answer_review_rejected",
  "comment_review_approved",
  "comment_review_rejected",
  // Phase 110 — a classmate's "Tebrik Et" on a question this student shared in
  // their class. Server-verified same-class membership; one per sender per
  // question; readable only by the recipient.
  "class_kudos_received",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Whether a stored `type` string is one this build can render. Lives beside
 *  the allowlist rather than in the notifications feature so the Firestore
 *  mapping layer can use it without depending on a feature module. */
export function isKnownNotificationType(value: string): value is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

// "moderation" (Phase 99): entityId is a moderationSubmissions id, used for
// identity only — these notifications navigate via parentEntityId (the parent
// question), never to a moderation document.
export type NotificationEntityType = "question" | "answer" | "friendship" | "class" | "moderation";

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
  parentEntityId: string | null;
  classId: string | null;
  messagePreview: string | null;
  createdAt: number;
  readAt: number | null;
  isRead: boolean;
}
