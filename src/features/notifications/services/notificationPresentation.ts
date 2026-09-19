import { Ionicons } from "@expo/vector-icons";

import { NotificationRecord } from "@/types/notification";

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
    // Phase 99 — the author's own moderation outcome. Deliberately the only
    // branches that do NOT use `actor`: the reviewing teacher is not named,
    // and neither is the reason the automated check could not settle it. The
    // student is told what happened to their content and what they can do
    // next, in the same neutral voice the submission gate already uses.
    //
    // The secondary line renders with numberOfLines={1}. Measured against the
    // row's real 263px text column: the softer "İstersen yeni bir yanıt
    // gönderebilirsin." is 306px at 150% text scale and would have been cut
    // off for exactly the readers who enlarge text. The shorter sentence fits
    // at every supported scale, so the guidance survives where it matters
    // more than the extra word did.
    case "answer_review_approved":
      return {
        icon: "checkmark-circle-outline",
        title: "Yanıtın yayınlandı",
        secondaryText: "Artık sınıfta görüntülenebilir.",
      };
    case "answer_review_rejected":
      return {
        icon: "close-circle-outline",
        title: "Yanıtın yayınlanmadı",
        secondaryText: "Yeni bir yanıt gönderebilirsin.",
      };
    case "comment_review_approved":
      return {
        icon: "checkmark-circle-outline",
        title: "Yorumun yayınlandı",
        secondaryText: "Artık sınıfta görüntülenebilir.",
      };
    case "comment_review_rejected":
      return {
        icon: "close-circle-outline",
        title: "Yorumun yayınlanmadı",
        secondaryText: "Yeni bir yorum gönderebilirsin.",
      };
    // Phase 110 — a classmate's "Tebrik Et". Named, because both people are
    // current members of the same class (verified by sendClassKudos) and
    // classmates already see each other's names there. Never a count.
    case "class_kudos_received":
      return {
        icon: "sparkles-outline",
        title: `${actor} seni tebrik etti`,
        secondaryText: "Sınıfta paylaştığın soru için",
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
  // The secondary line is part of the meaning for a moderation outcome ("…
  // İstersen yeni bir yanıt gönderebilirsin"), so it is spoken rather than
  // left as visual-only detail.
  const detail = presentation.secondaryText ? `${presentation.secondaryText} ` : "";
  return `${presentation.title}. ${detail}${status}`;
}

export { isKnownNotificationType } from "@/types/notification";
