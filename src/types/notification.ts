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
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationEntityType = "question" | "answer" | "friendship" | "class";

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
