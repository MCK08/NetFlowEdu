// Firebase callable errors always surface client-side with a "functions/"
// prefix (see classErrorMapper.ts's own tests) — mapped here to distinct,
// non-generic Turkish messages, same convention as classErrorMapper.ts and
// authentication/errorMapper.ts.
const FRIEND_ERROR_MESSAGES: Record<string, string> = {
  "functions/unauthenticated": "Oturumunuz bulunamadı. Lütfen tekrar giriş yapın.",
  "functions/invalid-argument": "Geçersiz istek. Lütfen tekrar deneyin.",
  "functions/not-found": "Bu işlem artık geçerli değil — sayfa güncel olmayabilir.",
  "functions/failed-precondition": "Bu işlem şu anda yapılamıyor.",
  "functions/permission-denied": "Bu işlem için yetkiniz yok.",
  "functions/already-exists": "Zaten arkadaşsınız.",
};

const GENERIC_MESSAGE = "Bir şeyler ters gitti. Lütfen tekrar deneyin.";

export function mapFriendErrorToMessage(code: string | undefined): string {
  if (code === undefined) return GENERIC_MESSAGE;
  return FRIEND_ERROR_MESSAGES[code] ?? GENERIC_MESSAGE;
}
