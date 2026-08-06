import { FirebaseError } from "firebase/app";

// Same contract as the auth/friend/notification mappers: never surface a raw
// Firebase code or SDK message, always a specific Turkish sentence, and use
// the generic fallback ONLY for a genuinely unknown code.
//
// `internal` is present deliberately from day one — its absence from the
// friend mapper is exactly what hid the 2026-08-05 read-before-write outage
// behind "Bir şeyler ters gitti".
const STUDY_ERROR_MESSAGES: Record<string, string> = {
  unauthenticated: "Oturumunuz bulunamadı. Lütfen tekrar giriş yapın.",
  "permission-denied": "Bu soruya erişim izniniz yok.",
  "not-found": "Bu soru artık mevcut değil.",
  "invalid-argument": "Geçersiz istek. Lütfen tekrar deneyin.",
  "failed-precondition": "Bu işlem şu anda tamamlanamadı. Lütfen tekrar deneyin.",
  aborted: "İşlem çakıştı. Lütfen tekrar deneyin.",
  unavailable: "Bağlantı sorunu. Lütfen tekrar deneyin.",
  "deadline-exceeded": "İşlem zaman aşımına uğradı. Lütfen tekrar deneyin.",
  "resource-exhausted": "Çok fazla istek gönderildi. Lütfen biraz sonra tekrar deneyin.",
  internal: "Sunucu tarafında bir hata oluştu. Lütfen daha sonra tekrar deneyin.",
};

const DEFAULT_MESSAGE = "Çalışma kaydedilemedi. Lütfen tekrar deneyin.";

function isFirebaseError(error: unknown): error is FirebaseError {
  return typeof error === "object" && error !== null && "code" in error;
}

// Callable errors arrive prefixed ("functions/permission-denied"), plain
// Firestore errors do not — normalized so one table covers both.
function normalizeCode(code: string): string {
  return code.startsWith("functions/") ? code.slice("functions/".length) : code;
}

export function mapStudyErrorToMessage(error: unknown): string {
  if (isFirebaseError(error)) {
    return STUDY_ERROR_MESSAGES[normalizeCode(error.code)] ?? DEFAULT_MESSAGE;
  }
  return DEFAULT_MESSAGE;
}
