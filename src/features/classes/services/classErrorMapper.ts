// Turkish messages for the createClass callable's failures.
//
// Kept feature-scoped (not folded into authentication's errorMapper) for the
// same reason that one keeps onboarding failures separate: callable
// HttpsError codes are overloaded across features and mean different things
// depending on which callable raised them. "failed-precondition" here means
// "your account has no organizationId", which is a completely different
// situation — and a completely different instruction to the user — than the
// same code coming from setUsername or completeOnboarding.
//
// createClass throws exactly seven codes (see
// functions/src/classes/createClass.ts). Before this existed, all seven were
// collapsed by useTeacherClasses into one sentence: "Sınıf oluşturulamadı.
// Lütfen tekrar deneyin." That is actively misleading for the two claim
// related codes: a teacher whose ID token still carries stale/missing
// role/organizationId claims can press "Oluştur" forever and it will never
// succeed — the fix is refreshing the session, which the old message never
// told them to do.
const CLASS_ERROR_MESSAGES: Record<string, string> = {
  // request.auth.token.role !== "teacher" — the client-side session is not
  // (or no longer) carrying teacher claims. Retrying is useless; the token
  // has to be reissued.
  "functions/permission-denied":
    "Öğretmen yetkiniz bu oturumda görünmüyor. Lütfen çıkış yapıp tekrar giriş yapın.",
  // Teacher role present but organizationId missing — onboarding never
  // finished granting the organization, or the token predates it.
  "functions/failed-precondition":
    "Hesabınız bir kuruma bağlı değil. Lütfen çıkış yapıp tekrar giriş yapın.",
  "functions/unauthenticated": "Oturumunuz bulunamadı. Lütfen tekrar giriş yapın.",
  "functions/invalid-argument": "Sınıf adı geçersiz. Lütfen bir sınıf adı girin.",
  // Genuinely transient — the server exhausted its join-code attempts or hit
  // a code collision. Pressing the button again is the correct action.
  "functions/resource-exhausted": "Sınıf kodu oluşturulamadı. Lütfen tekrar deneyin.",
  "functions/already-exists": "Sınıf kodu çakıştı. Lütfen tekrar deneyin.",
  "functions/unavailable": "Bağlantı sorunu. Lütfen tekrar deneyin.",
  "functions/internal": "Sunucu hatası. Lütfen tekrar deneyin.",
  "functions/deadline-exceeded": "İşlem zaman aşımına uğradı. Lütfen tekrar deneyin.",
};

const CLASS_DEFAULT_MESSAGE = "Sınıf oluşturulamadı. Lütfen tekrar deneyin.";

// The two codes above that a retry can never resolve — the user has to
// refresh their session instead. Exposed so the UI can, if it wants, stop
// inviting a pointless retry.
const SESSION_REFRESH_REQUIRED_CODES = new Set([
  "functions/permission-denied",
  "functions/failed-precondition",
  "functions/unauthenticated",
]);

export function requiresSessionRefresh(code: string | undefined): boolean {
  return code !== undefined && SESSION_REFRESH_REQUIRED_CODES.has(code);
}

export function mapClassErrorToMessage(code: string | undefined): string {
  if (code === undefined) return CLASS_DEFAULT_MESSAGE;
  return CLASS_ERROR_MESSAGES[code] ?? CLASS_DEFAULT_MESSAGE;
}
