import { CommentSubmissionStatus } from "./commentSubmission";

// User-facing copy for the moderation gate.
//
// Every message here is deliberately uninformative about the decision. A
// rejected comment is not told which word matched, which category fired, or
// whether a provider was involved — that would turn the refusal screen into
// a tuning tool. It is also never phrased as an accusation: the student may
// have written something perfectly innocent that a keyword layer misread.

export interface SubmissionFeedback {
  title: string;
  message: string;
  /** Whether the composer should clear the draft. A refusal keeps the text
   *  so the student can edit it rather than losing what they wrote —
   *  silently discarding user content is its own bug. */
  clearDraft: boolean;
}

export function commentStatusFeedback(status: CommentSubmissionStatus): SubmissionFeedback {
  switch (status) {
    case "published":
      return { title: "Yorumun gönderildi.", message: "", clearDraft: true };
    case "in_review":
      return {
        title: "Yorumun inceleniyor.",
        message: "Onaylandığında yayınlanacak.",
        clearDraft: true,
      };
    case "not_published":
      return {
        title: "Yorumun gönderilemedi.",
        message: "Bu içerik topluluk kurallarımıza uygun olmadığı için gönderilemedi.",
        clearDraft: false,
      };
    case "checking":
      return {
        title: "Yorumun kontrol ediliyor.",
        message: "Kontrol tamamlandığında yayınlanacak.",
        clearDraft: true,
      };
  }
}

// Firebase error codes -> safe Turkish copy.
//
// Never returns the raw Firebase message: those carry internal detail
// (collection paths, rule line numbers, provider text) that is useless to a
// student and useful to an attacker.
export function mapCommentSubmissionError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? "";
  const bare = code.startsWith("functions/") ? code.slice("functions/".length) : code;

  switch (bare) {
    case "unauthenticated":
      return "Bu işlem için giriş yapman gerekiyor.";
    case "permission-denied":
      return "Bu içeriği gönderme yetkin bulunmuyor.";
    case "not-found":
      return "Bu soru artık mevcut değil.";
    case "invalid-argument":
      return "Yorum gönderilemedi. Metni kontrol edip tekrar dene.";
    case "resource-exhausted":
      return "Çok hızlı gönderim yaptın. Biraz bekleyip tekrar dene.";
    case "unavailable":
    case "deadline-exceeded":
      return "İçerik şu anda kontrol edilemedi. Daha sonra tekrar dene.";
    case "failed-precondition":
      return "Bu içerik şu anda gönderilemiyor.";
    default:
      return "Yorum gönderilirken bir sorun oluştu. Tekrar deneyebilirsin.";
  }
}
