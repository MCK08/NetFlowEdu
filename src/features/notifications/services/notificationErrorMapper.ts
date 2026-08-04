import { FirebaseError } from "firebase/app";

// Same shape/intent as authentication/services/errorMapper.ts — never
// surface a raw Firebase code or message to the user, only a mapped
// Turkish sentence. Covers both this feature's Firestore reads/writes
// (list, mark-read) and its one callable (markAllNotificationsRead).
const NOTIFICATION_ERROR_MESSAGES: Record<string, string> = {
  unauthenticated: "Oturumunuz bulunamadı. Lütfen tekrar giriş yapın.",
  "permission-denied": "Bu bildirimlere erişim izniniz yok.",
  unavailable: "Bağlantı sorunu. Lütfen tekrar deneyin.",
  "deadline-exceeded": "İşlem zaman aşımına uğradı. Lütfen tekrar deneyin.",
  "not-found": "Bildirim bulunamadı.",
  "failed-precondition": "Bu işlem şu anda tamamlanamadı. Lütfen tekrar deneyin.",
  "resource-exhausted": "Çok fazla istek gönderildi. Lütfen biraz sonra tekrar deneyin.",
};

const DEFAULT_MESSAGE = "Bildirimler yüklenirken bir sorun oluştu. Lütfen tekrar deneyin.";

function isFirebaseError(error: unknown): error is FirebaseError {
  return typeof error === "object" && error !== null && "code" in error;
}

// Firestore SDK error codes arrive bare ("permission-denied"); callable
// HttpsError codes arrive prefixed ("functions/permission-denied") — both
// are normalized to the same lookup key here so one table covers both
// surfaces this feature actually uses.
function normalizeCode(code: string): string {
  return code.startsWith("functions/") ? code.slice("functions/".length) : code;
}

export function mapNotificationErrorToMessage(error: unknown): string {
  if (isFirebaseError(error)) {
    return NOTIFICATION_ERROR_MESSAGES[normalizeCode(error.code)] ?? DEFAULT_MESSAGE;
  }
  return DEFAULT_MESSAGE;
}
