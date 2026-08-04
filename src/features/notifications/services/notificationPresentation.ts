import { Ionicons } from "@expo/vector-icons";

import { NotificationRecord, NotificationType } from "@/types/notification";

export interface NotificationPresentation {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  secondaryText: string | null;
}

function actorLabel(notification: NotificationRecord): string {
  return notification.actorDisplayName || "Bir kullanıcı";
}

// Pure mapper from a raw notification document to what a row actually
// shows — the only place the seven allowlisted types (see
// @/types/notification) are turned into Turkish copy. Every branch is
// exhaustively type-checked (the `never` in the default arm fails a build
// the day a new type is added to the allowlist without updating this
// mapper).
export function presentNotification(notification: NotificationRecord): NotificationPresentation {
  const actor = actorLabel(notification);

  switch (notification.type) {
    case "question_answered":
      return {
        icon: "chatbox-ellipses-outline",
        title: `${actor} sorunu cevapladı`,
        secondaryText: null,
      };
    case "question_liked":
      return {
        icon: "heart",
        title: `${actor} sorunu beğendi`,
        secondaryText: null,
      };
    case "answer_liked":
      return {
        icon: "heart",
        title: `${actor} cevabını beğendi`,
        secondaryText: null,
      };
    case "question_commented":
      return {
        icon: "chatbubble-ellipses-outline",
        title: `${actor} soruna yorum yaptı`,
        secondaryText: null,
      };
    case "friend_request_received":
      return {
        icon: "person-add-outline",
        title: `${actor} sana arkadaşlık isteği gönderdi`,
        secondaryText: null,
      };
    case "friend_request_accepted":
      return {
        icon: "people-outline",
        title: `${actor} arkadaşlık isteğini kabul etti`,
        secondaryText: null,
      };
    case "class_student_joined":
      return {
        icon: "school-outline",
        title: `${actor} sınıfına katıldı`,
        secondaryText: notification.messagePreview,
      };
    default: {
      const exhaustive: never = notification.type;
      throw new Error(`Unhandled notification type: ${String(exhaustive)}`);
    }
  }
}

// Screen-reader text, distinct from the visual title — states read/unread
// state explicitly rather than relying on a color-only indicator (Stage 12).
export function notificationAccessibilityLabel(
  notification: NotificationRecord,
  presentation: NotificationPresentation,
): string {
  const status = notification.isRead ? "Okundu." : "Okunmadı.";
  return `${presentation.title}. ${status}`;
}

export function isKnownNotificationType(value: string): value is NotificationType {
  return [
    "question_answered",
    "question_liked",
    "answer_liked",
    "question_commented",
    "friend_request_received",
    "friend_request_accepted",
    "class_student_joined",
  ].includes(value);
}
