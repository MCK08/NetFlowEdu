import { AnswerSubmissionStatus } from "./answerService";

// User-facing copy for the answer moderation gate.
//
// Nothing here names a provider, a category, a score or a threshold. A
// refusal is phrased as a policy outcome, not an accusation — an image
// classifier can be wrong, and telling a student exactly what tripped it
// would also tell them how to get around it.

export interface AnswerFeedback {
  title: string;
  message: string;
  /** Whether the compose screen should close. A refusal keeps the student on
   *  the screen with their drawing intact so they can change it, rather than
   *  discarding work they may have spent real effort on. */
  dismiss: boolean;
}

export function answerStatusFeedback(status: AnswerSubmissionStatus): AnswerFeedback {
  switch (status) {
    case "published":
      return { title: "Cevabın gönderildi.", message: "", dismiss: true };
    case "in_review":
      return {
        title: "Cevabın inceleniyor.",
        // Phase 99 — the second sentence is new because the outcome it points
        // at is new. Before manual review had a resolver and a result the
        // author could see, "onaylandığında" was a promise with no visible
        // ending: an approval arrived silently and a refusal arrived not at
        // all. Both now produce exactly one notification, so it is finally
        // true to tell the student where to look.
        message: "Onaylandığında yayınlanacak. Sonucu bildirimlerinde göreceksin.",
        dismiss: true,
      };
    case "not_published":
      return {
        title: "Cevabın gönderilemedi.",
        message: "Bu içerik topluluk kurallarımıza uygun olmadığı için gönderilemedi.",
        dismiss: false,
      };
    case "checking":
      return {
        title: "Cevabın kontrol ediliyor.",
        message: "Kontrol tamamlandığında yayınlanacak.",
        dismiss: true,
      };
  }
}

/** Firebase error codes -> safe Turkish copy. Never returns a raw Firebase
 *  or provider message: those carry internal paths and vendor detail. */
export function mapAnswerSubmissionError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? "";
  const bare = code.startsWith("functions/") ? code.slice("functions/".length) : code;

  switch (bare) {
    case "unauthenticated":
      return "Bu işlem için giriş yapman gerekiyor.";
    case "permission-denied":
      return "Bu içeriği gönderme yetkin bulunmuyor.";
    case "not-found":
      return "Bu soru artık mevcut değil.";
    case "failed-precondition":
      return "Görsel yüklenemedi. Tekrar deneyebilirsin.";
    case "invalid-argument":
      return "Bu dosya gönderilemedi. Farklı bir görsel deneyebilirsin.";
    case "resource-exhausted":
      return "Çok hızlı gönderim yaptın. Biraz bekleyip tekrar dene.";
    case "unavailable":
    case "deadline-exceeded":
      return "İçerik şu anda kontrol edilemedi. Daha sonra tekrar dene.";
    default:
      return "Cevap gönderilirken bir sorun oluştu. Tekrar deneyebilirsin.";
  }
}
