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
  "auth/user-token-expired": "Oturumunuzun süresi doldu. Lütfen tekrar giriş yapın.",
  // Newer Firebase Auth builds (email-enumeration protection enabled)
  // report a bad email/password pair under this code instead of
  // wrong-password/user-not-found. Mapped to the SAME message as those, so
  // enabling that setting can never turn a wrong password into a generic
  // "bir şeyler ters gitti" — and so the message still can't be used to
  // learn whether an address is registered.
  "auth/invalid-login-credentials": "E-posta veya şifre hatalı.",
  // The sign-in provider itself is switched off in the Firebase console —
  // a configuration problem, deliberately NOT phrased as a credential
  // failure, which would send the user off retyping a correct password.
  "auth/operation-not-allowed": "Bu giriş yöntemi şu anda kullanılamıyor.",
  "auth/internal-error": "Sunucu hatası. Lütfen tekrar deneyin.",
  "auth/timeout": "İşlem zaman aşımına uğradı. Lütfen tekrar deneyin.",
  // Google account-linking codes (ProfileScreen's "Google hesabını bağla").
  "auth/account-exists-with-different-credential":
    "Bu e-posta adresi farklı bir giriş yöntemiyle kayıtlı. Lütfen o yöntemle giriş yapın.",
  "auth/credential-already-in-use": "Bu Google hesabı başka bir kullanıcıya bağlı.",
  "auth/provider-already-linked": "Bu hesaba zaten bir Google hesabı bağlı.",
  // Only reachable if actionCodeSettings is ever passed to
  // sendEmailVerification — this codebase currently does not pass one (see
  // services/firebase/auth.ts), so these are unused today but mapped in
  // case that changes.
  "auth/invalid-continue-uri": "Uygulama yapılandırmasında bir sorun var. Lütfen destek ile iletişime geçin.",
  "auth/unauthorized-continue-uri": "Uygulama yapılandırmasında bir sorun var. Lütfen destek ile iletişime geçin.",
  "auth/missing-continue-uri": "Uygulama yapılandırmasında bir sorun var. Lütfen destek ile iletişime geçin.",
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
  if (error instanceof Error && error.message === "NO_CURRENT_USER") {
    return "Oturumunuz bulunamadı. Lütfen tekrar giriş yapın.";
  }
  if (isFirebaseError(error)) {
    return AUTH_ERROR_MESSAGES[error.code] ?? DEFAULT_MESSAGE;
  }
  return DEFAULT_MESSAGE;
}

// Stage-2 onboarding (completeOnboarding) failures, mapped SEPARATELY from
// AUTH_ERROR_MESSAGES on purpose: several callable codes are overloaded
// across features and mean completely different things depending on which
// callable raised them. "functions/failed-precondition" is the concrete
// case — setUsername raises it for "you already have a username", while
// completeOnboarding raises it for "Hesap türü seçilmemiş". Routing an
// onboarding failure through the generic map showed the user the username
// message, which is simply wrong and not actionable.
const ONBOARDING_FAILURE_MESSAGES: Record<string, string> = {
  // completeOnboarding's requestedRole guard. The account exists and the
  // email is verified, but Stage 1 never recorded which account type was
  // picked — so there is nothing for Stage 2 to grant. Recoverable only by
  // finishing registration again for this same email.
  "functions/failed-precondition":
    "Hesap türünüz kaydedilmemiş. Lütfen çıkış yapıp aynı e-posta ile kaydı tamamlayın.",
  "functions/not-found": "Hesabınız bulunamadı. Lütfen tekrar kayıt olun.",
  "functions/unauthenticated": "Oturumunuz bulunamadı. Lütfen tekrar giriş yapın.",
  "functions/permission-denied": "Bu işlem için yetkiniz yok.",
  // Transient/retryable — the same button press can simply be repeated,
  // and completeOnboarding is idempotent so repeating is always safe.
  "functions/unavailable": "Bağlantı sorunu. Lütfen tekrar deneyin.",
  "functions/internal": "Sunucu hatası. Lütfen tekrar deneyin.",
  "functions/deadline-exceeded": "İşlem zaman aşımına uğradı. Lütfen tekrar deneyin.",
  "functions/resource-exhausted": "Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.",
  // Client-side sentinels (never reach the network) — see onboardingSession.
  "client/email-not-verified":
    "E-posta adresiniz henüz doğrulanmamış görünüyor. Bağlantıya tıkladıktan sonra tekrar deneyin.",
  "client/no-current-user": "Oturumunuz bulunamadı. Lütfen tekrar giriş yapın.",
};

const ONBOARDING_DEFAULT_MESSAGE =
  "Hesap tipiniz ayarlanamadı. Lütfen tekrar deneyin.";

// Codes worth telling the user to just press the button again for.
const RETRYABLE_ONBOARDING_CODES = new Set([
  "functions/unavailable",
  "functions/internal",
  "functions/deadline-exceeded",
  "functions/resource-exhausted",
  "client/email-not-verified",
]);

export function isRetryableOnboardingFailure(code: string | undefined): boolean {
  return code !== undefined && RETRYABLE_ONBOARDING_CODES.has(code);
}

export function mapOnboardingFailureToMessage(code: string | undefined): string {
  if (code === undefined) return ONBOARDING_DEFAULT_MESSAGE;
  return ONBOARDING_FAILURE_MESSAGES[code] ?? ONBOARDING_DEFAULT_MESSAGE;
}

// ---------------------------------------------------------------------------
// Google sign-in outcomes
//
// These never reach Firebase at all — they are the results of
// expo-auth-session's browser flow, which reports them as a plain
// `result.type`, not as a FirebaseError with a code. They lived as bare
// string literals inside GoogleSignInButton, where nothing could assert
// that a CANCELLATION isn't shown as a failure. Kept in this module rather
// than a second error file so there is still exactly one place that turns
// an auth outcome into user-facing Turkish.
// ---------------------------------------------------------------------------
export type GoogleFailureKind =
  // The person closed the browser sheet. A deliberate choice, not an error.
  | "cancelled"
  // The flow reported success but carried no id_token — nothing to exchange.
  | "missing_token"
  // signInWithCredential/addAccount threw while exchanging the token.
  | "exchange_failed";

const GOOGLE_FAILURE_MESSAGES: Record<GoogleFailureKind, string | null> = {
  cancelled: null,
  missing_token: "Google girişi tamamlanamadı. Lütfen tekrar deneyin.",
  exchange_failed: "Google ile giriş yapılamadı. Lütfen tekrar deneyin.",
};

// `null` means "show nothing" — the only correct treatment of a
// cancellation. Callers must handle null rather than falling back to a
// generic message, which is exactly the regression this guards.
export function mapGoogleFailureToMessage(kind: GoogleFailureKind): string | null {
  return GOOGLE_FAILURE_MESSAGES[kind];
}

// ---------------------------------------------------------------------------
// Local session / account-switch outcomes
//
// switchToStoredAccount returns null (not an error) when a stored account's
// local Firebase session is gone. That is not a credential failure and must
// not be phrased as one — nothing the person typed was wrong.
// ---------------------------------------------------------------------------
export const SESSION_REQUIRES_REAUTH_MESSAGE =
  "Bu hesabın oturumu sona ermiş. Devam etmek için şifrenle tekrar giriş yap.";

export const ADD_ACCOUNT_SUSPENDED_MESSAGE =
  "Bu hesap askıya alınmış. Yardım için okulunuzla veya kurumunuzla iletişime geçin.";
