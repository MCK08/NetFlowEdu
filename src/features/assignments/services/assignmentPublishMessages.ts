// Phase 33 — user-facing copy for assignment prepare()/publish() failures.
//
// Same shape as answers/services/answerSubmissionMessages.ts's
// mapAnswerSubmissionError: a Firebase error carries an internal error.code
// that is safe to branch on but unsafe to show verbatim (Firestore/Functions
// error text can leak collection paths or rule internals), so this maps the
// handful of codes that mean something concrete to the teacher into real
// Turkish copy, and falls back to one generic message for everything else —
// never a raw Firebase message in the UI.

export function mapAssignmentPublishError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? "";

  switch (code) {
    case "permission-denied":
      return "Ödev oluşturma yetkiniz doğrulanamadı.";
    case "not-found":
      return "Bu sınıf artık mevcut değil.";
    case "unauthenticated":
      return "Bu işlem için giriş yapman gerekiyor.";
    case "resource-exhausted":
      return "Çok hızlı gönderim yaptın. Biraz bekleyip tekrar dene.";
    case "unavailable":
    case "deadline-exceeded":
      return "Bağlantı sorunu yaşandı. Daha sonra tekrar dene.";
    default:
      return "Ödev oluşturulamadı. Lütfen tekrar deneyin.";
  }
}

export function mapAssignmentPrepareError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? "";

  switch (code) {
    case "permission-denied":
      return "Bu sınıfın sorularını görüntüleme yetkiniz doğrulanamadı.";
    case "unauthenticated":
      return "Bu işlem için giriş yapman gerekiyor.";
    case "unavailable":
    case "deadline-exceeded":
      return "Bağlantı sorunu yaşandı. Daha sonra tekrar dene.";
    default:
      return "Sorular hazırlanamadı. Lütfen tekrar deneyin.";
  }
}

// Development-only diagnostics. Never shown to the user (see the mappers
// above for what IS shown) — this exists so the real Firebase error.code/
// message is never silently discarded by an empty `catch {}`, which is
// exactly what made this failure unreproducible from a bug report alone
// (Phase 33 audit).
export function logAssignmentError(scope: "prepare" | "publish", error: unknown): void {
  if (!__DEV__) return;
  const e = error as { code?: string; message?: string };
  // eslint-disable-next-line no-console
  console.log(`[assignment ${scope}] code=${e?.code ?? "unknown"}`);
  // eslint-disable-next-line no-console
  console.log(`[assignment ${scope}] message=${e?.message ?? String(error)}`);
}
