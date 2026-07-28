export const MAX_MESSAGE_LENGTH = 1000;

// Pure — no Firebase dependency, so it's directly unit-testable. Mirrors
// firestore.rules' classes/{classId}/messages create rule (text.size() > 0
// and <= 1000) exactly; the server-side bound is what actually enforces
// this, this is just the client-side pre-check for a fast, clear Turkish
// error instead of a round-trip permission-denied.
export function validateMessageText(rawText: string): string | null {
  const trimmed = rawText.trim();
  if (trimmed.length === 0) {
    return "Mesaj boş olamaz.";
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return `Mesaj en fazla ${MAX_MESSAGE_LENGTH} karakter olabilir.`;
  }
  return null;
}

export function normalizeMessageText(rawText: string): string {
  return rawText.trim();
}
