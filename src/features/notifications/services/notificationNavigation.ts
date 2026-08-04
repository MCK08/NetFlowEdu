import { NotificationRecord } from "@/types/notification";
import { UserRole } from "@/types/user";

export type NotificationDestination =
  | { kind: "route"; path: string }
  | { kind: "unavailable"; message: string };

const GENERIC_UNAVAILABLE = "Bu içerik artık mevcut değil.";

// Only student has a question-detail route today — there is no
// (teacher)/question/[questionId] screen anywhere in this app (verified
// during the Phase 15 audit). Rather than invent one (explicitly out of
// scope — Stage 16 forbids unrelated new navigation targets), a teacher
// tapping a question-related notification gets a clear, safe "not
// available yet" outcome instead of a broken push or a guessed route.
function questionDestination(
  notification: NotificationRecord,
  role: UserRole,
  questionId: string | null,
): NotificationDestination {
  if (!questionId) {
    return { kind: "unavailable", message: GENERIC_UNAVAILABLE };
  }
  if (role === "student") {
    return { kind: "route", path: `/(student)/question/${questionId}` };
  }
  return {
    kind: "unavailable",
    message: "Bu bildirim şu anda öğretmen görünümünde açılamıyor.",
  };
}

function friendsDestination(role: UserRole): NotificationDestination {
  if (role === "teacher") {
    return { kind: "route", path: "/(teacher)/(tabs)/friends" };
  }
  return { kind: "route", path: "/(student)/friends" };
}

// Pure — takes the caller's role explicitly rather than reading useAuth
// itself, so it's testable with zero React/Firebase setup and so the
// caller (the screen) stays the single place that actually knows "which
// role am I". Never throws: a notification whose entity no longer exists,
// or whose type has no route for the current role, resolves to
// `unavailable` instead — the screen's job is to still let the user mark
// it read and show a clear message, never crash or redirect-loop.
export function resolveNotificationDestination(
  notification: NotificationRecord,
  role: UserRole,
): NotificationDestination {
  switch (notification.type) {
    case "question_answered":
    case "question_liked":
    case "question_commented":
      return questionDestination(notification, role, notification.entityId || null);
    case "answer_liked":
      return questionDestination(notification, role, notification.parentEntityId);
    case "friend_request_received":
    case "friend_request_accepted":
      return friendsDestination(role);
    case "class_student_joined": {
      if (!notification.classId) {
        return { kind: "unavailable", message: GENERIC_UNAVAILABLE };
      }
      if (role === "teacher") {
        return { kind: "route", path: `/(teacher)/class/${notification.classId}` };
      }
      return { kind: "unavailable", message: GENERIC_UNAVAILABLE };
    }
    default: {
      const exhaustive: never = notification.type;
      throw new Error(`Unhandled notification type: ${String(exhaustive)}`);
    }
  }
}
