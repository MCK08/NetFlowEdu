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

// ---- class question feed (read path) ---------------------------------
//
// Separate from CLASS_ERROR_MESSAGES above because the same codes mean
// something different when READING a class feed than when CREATING a class.
// "permission-denied" here is the important one: for the feed it almost
// always means the student is no longer a member of this class (the teacher
// removed them, or they left on another device) — firestore.rules gates the
// list query on isClassMember(classId). Telling them to "try again" would
// loop forever; telling them they're no longer in the class is actionable.
const CLASS_FEED_ERROR_MESSAGES: Record<string, string> = {
  "permission-denied": "Bu sınıfın sorularına erişiminiz yok. Sınıftan çıkarılmış olabilirsiniz.",
  unauthenticated: "Oturumunuz bulunamadı. Lütfen tekrar giriş yapın.",
  "failed-precondition": "Sorular şu anda listelenemiyor. Lütfen daha sonra tekrar deneyin.",
  "not-found": "Bu sınıf bulunamadı. Sınıf silinmiş olabilir.",
  unavailable: "Bağlantı sorunu. İnternet bağlantınızı kontrol edip tekrar deneyin.",
  "deadline-exceeded": "İstek zaman aşımına uğradı. Lütfen tekrar deneyin.",
  "resource-exhausted": "Çok fazla istek gönderildi. Lütfen biraz bekleyip tekrar deneyin.",
  cancelled: "İstek iptal edildi. Lütfen tekrar deneyin.",
  internal: "Sunucu hatası. Lütfen tekrar deneyin.",
  // The Firebase JS SDK surfaces offline/network failures with this code on
  // the Firestore client.
  "network-request-failed": "Bağlantı sorunu. İnternet bağlantınızı kontrol edip tekrar deneyin.",
};

const CLASS_FEED_DEFAULT_MESSAGE = "Sorular yüklenemedi. Lütfen tekrar deneyin.";

// Failures a retry button genuinely cannot fix — the user has to leave the
// feed rather than keep pressing "Tekrar dene".
const FEED_UNRECOVERABLE_CODES = new Set([
  "permission-denied",
  "unauthenticated",
  "not-found",
]);

export function isRecoverableFeedError(code: string | undefined): boolean {
  if (code === undefined) return true;
  return !FEED_UNRECOVERABLE_CODES.has(code);
}

export function mapClassFeedErrorToMessage(code: string | undefined): string {
  if (code === undefined) return CLASS_FEED_DEFAULT_MESSAGE;
  return CLASS_FEED_ERROR_MESSAGES[code] ?? CLASS_FEED_DEFAULT_MESSAGE;
}

// ---- joining a class by code -----------------------------------------
//
// Production incident: every one of joinClassByCode's distinct failures was
// collapsed into a single sentence — "Geçersiz kod veya katılım başarısız.
// Lütfen tekrar deneyin." A student typing a perfectly valid code
// (permission-denied from the org-equality bug) was told their code was
// invalid, which sent the investigation in the wrong direction entirely and
// gave the student no way to act.
//
// Each code below is a genuinely different situation with a genuinely
// different next step for the user.
const JOIN_CLASS_ERROR_MESSAGES: Record<string, string> = {
  // The code does not exist, or the class behind it is gone/archived.
  "functions/not-found": "Bu kod geçerli değil. Kodu öğretmeninizden tekrar kontrol edin.",
  // Already a member — joinClassByCode itself treats this as success, so
  // reaching this code means a genuinely conflicting state.
  "functions/already-exists": "Bu sınıfa zaten katıldınız.",
  // Wrong account type — only students may join.
  "functions/permission-denied":
    "Bu hesap türüyle sınıfa katılamazsınız. Öğrenci hesabıyla giriş yapın.",
  "functions/failed-precondition":
    "Sınıfa katılım şu anda tamamlanamadı. Lütfen daha sonra tekrar deneyin.",
  "functions/unauthenticated": "Oturumunuz bulunamadı. Lütfen tekrar giriş yapın.",
  "functions/invalid-argument": "Lütfen geçerli bir sınıf kodu girin.",
  // Transient — retrying genuinely helps.
  "functions/unavailable": "Bağlantı sorunu. İnternet bağlantınızı kontrol edip tekrar deneyin.",
  "functions/internal": "Sunucu hatası. Lütfen tekrar deneyin.",
  "functions/deadline-exceeded": "İşlem zaman aşımına uğradı. Lütfen tekrar deneyin.",
  "functions/resource-exhausted":
    "Çok fazla deneme yapıldı. Lütfen biraz bekleyip tekrar deneyin.",
  "network-request-failed": "Bağlantı sorunu. İnternet bağlantınızı kontrol edip tekrar deneyin.",
};

const JOIN_CLASS_DEFAULT_MESSAGE = "Sınıfa katılınamadı. Lütfen tekrar deneyin.";

export function mapJoinClassErrorToMessage(code: string | undefined): string {
  if (code === undefined) return JOIN_CLASS_DEFAULT_MESSAGE;
  return JOIN_CLASS_ERROR_MESSAGES[code] ?? JOIN_CLASS_DEFAULT_MESSAGE;
}
