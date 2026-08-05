// Firebase callable errors always surface client-side with a "functions/"
// prefix (see classErrorMapper.ts's own tests) — mapped here to distinct,
// non-generic Turkish messages, same convention as classErrorMapper.ts and
// authentication/errorMapper.ts.
const FRIEND_ERROR_MESSAGES: Record<string, string> = {
  "functions/unauthenticated": "Oturumunuz bulunamadı. Lütfen tekrar giriş yapın.",
  "functions/invalid-argument": "Geçersiz istek. Lütfen tekrar deneyin.",
  "functions/not-found": "Bu işlem artık geçerli değil — sayfa güncel olmayabilir.",
  // assertEligibleUser raises this for an account whose accountStatus is
  // not "active" — see functions/src/friends/eligibility.ts.
  "functions/failed-precondition": "Bu hesap şu anda aktif değil.",
  "functions/permission-denied": "Bu işlem için yetkiniz yok.",
  "functions/already-exists": "Zaten arkadaşsınız.",
  // ---- Added after the 2026-08-05 production incident ------------------
  // A server-side exception surfaces as `internal`. It was previously
  // absent from this table, so a real, reproducible backend failure (the
  // Firestore read-before-write bug) rendered as the catch-all "Bir şeyler
  // ters gitti" and gave neither the user nor the logs any signal that
  // something was genuinely broken rather than merely transient. It now
  // says plainly that the problem is on the server side.
  "functions/internal": "Sunucu tarafında bir hata oluştu. Lütfen daha sonra tekrar deneyin.",
  // Transient — retrying the exact same action is safe and usually works.
  "functions/aborted": "İşlem çakıştı. Lütfen tekrar deneyin.",
  "functions/unavailable": "Bağlantı sorunu. Lütfen tekrar deneyin.",
  "functions/deadline-exceeded": "İşlem zaman aşımına uğradı. Lütfen tekrar deneyin.",
  "functions/resource-exhausted": "Çok fazla istek gönderildi. Lütfen biraz sonra tekrar deneyin.",
};

const GENERIC_MESSAGE = "Bir şeyler ters gitti. Lütfen tekrar deneyin.";

export function mapFriendErrorToMessage(code: string | undefined): string {
  if (code === undefined) return GENERIC_MESSAGE;
  return FRIEND_ERROR_MESSAGES[code] ?? GENERIC_MESSAGE;
}
