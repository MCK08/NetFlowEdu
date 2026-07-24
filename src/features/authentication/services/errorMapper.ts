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
  // setUsername.ts (a callable) — the Firebase JS SDK surfaces callable
  // HttpsError codes prefixed with "functions/". "already-exists" is
  // specifically "someone else already has this username" — the one
  // setUsername failure registration must show clearly, not swallow (see
  // authService.registerStudent).
  "functions/already-exists": "Bu kullanıcı adı zaten alınmış. Lütfen farklı bir kullanıcı adı deneyin.",
  // Surfaced only when the account already owns a DIFFERENT username than
  // the one just submitted — see authService.registerStudent's mismatch
  // check. Username changes aren't supported by the existing reservation
  // system, so this can't be silently resolved either way.
  "functions/failed-precondition": "Hesabınızda zaten farklı bir kullanıcı adı tanımlı.",
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
