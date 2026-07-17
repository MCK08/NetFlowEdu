import { FirebaseError } from "firebase/app";

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  "auth/invalid-email": "Geçerli bir e-posta adresi girin.",
  "auth/email-already-in-use": "Bu e-posta adresi zaten kullanımda.",
  "auth/weak-password": "Şifre çok zayıf. Daha güçlü bir şifre seçin.",
  "auth/invalid-credential": "E-posta veya şifre hatalı.",
  "auth/wrong-password": "E-posta veya şifre hatalı.",
  "auth/user-not-found": "E-posta veya şifre hatalı.",
  "auth/user-disabled": "Bu hesap devre dışı bırakılmış.",
  "auth/too-many-requests": "Çok fazla deneme yapıldı. Lütfen daha sonra tekrar deneyin.",
  "auth/network-request-failed": "Bağlantı hatası. İnternet bağlantınızı kontrol edin.",
  "auth/requires-recent-login": "Bu işlem için yeniden giriş yapmanız gerekiyor.",
  "auth/popup-closed-by-user": "İşlem iptal edildi.",
};

const DEFAULT_MESSAGE = "Bir şeyler ters gitti. Lütfen tekrar deneyin.";

function isFirebaseError(error: unknown): error is FirebaseError {
  return typeof error === "object" && error !== null && "code" in error;
}

// Never surfaces the raw Firebase error code/message to the user — only a
// mapped Turkish message. In development, the original error is still
// available to whoever calls this (log it yourself at the call site if
// needed); this function never logs anything itself.
export function mapAuthErrorToMessage(error: unknown): string {
  if (isFirebaseError(error)) {
    return AUTH_ERROR_MESSAGES[error.code] ?? DEFAULT_MESSAGE;
  }
  return DEFAULT_MESSAGE;
}
