export const MAX_COMMENT_LENGTH = 500;

// Pure — no Firebase dependency, so it's directly unit-testable. Mirrors
// firestore.rules' questionComments create rule (text.size() > 0 and
// <= 500) exactly; the server-side bound is what actually enforces this,
// this is just the client-side pre-check for a fast, clear Turkish error
// instead of a round-trip permission-denied.
export function validateCommentText(rawText: string): string | null {
  const trimmed = rawText.trim();
  if (trimmed.length === 0) {
    return "Yorum boş olamaz.";
  }
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    return `Yorum en fazla ${MAX_COMMENT_LENGTH} karakter olabilir.`;
  }
  return null;
}

export function normalizeCommentText(rawText: string): string {
  return rawText.trim();
}
