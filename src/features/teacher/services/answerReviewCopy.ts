// Phase 97 — teacher-facing wording for the answer review queue.
//
// The decision layer records WHY a submission needed a human in a machine
// token. This file turns that token into a factual Turkish sentence about the
// automated check — never about the student. A provider outage is an
// operational condition; "uncertain" is the provider declining to decide;
// neither is misconduct, and none of the copy below suggests otherwise.

export type AnswerReviewReason =
  | "provider_unavailable"
  | "no_image_provider"
  | "no_ocr_provider"
  | "uncertain";

/** What the queue and the detail say about why this item is here. */
export function reviewReasonCopy(reason: string): string {
  switch (reason) {
    case "provider_unavailable":
      return "Otomatik inceleme şu anda tamamlanamadı.";
    case "no_image_provider":
      return "Görsel için otomatik inceleme yapılamadı.";
    case "no_ocr_provider":
      return "Metin incelemesi otomatik tamamlanamadı.";
    case "uncertain":
      return "Otomatik inceleme bu yanıt için kesin karar veremedi.";
    default:
      return "Otomatik inceleme bu yanıt için tamamlanamadı.";
  }
}

/** Phase 98 — the same reasons, said about a comment. */
export function commentReviewReasonCopy(reason: string): string {
  switch (reason) {
    case "provider_unavailable":
      return "Otomatik inceleme şu anda tamamlanamadı.";
    case "uncertain":
      return "Otomatik inceleme bu yorum için kesin karar veremedi.";
    default:
      return "Otomatik inceleme bu yorum için tamamlanamadı.";
  }
}

export const COMMENT_REVIEW_QUEUE_TITLE = "Yorum İncelemeleri";

export const COMMENT_REVIEW_QUEUE_TRUST_NOTE =
  "Bu ekranda, otomatik incelemede kesin bir sonuca ulaşmayan öğrenci yorumlarını yayınlanmadan önce kontrol edebilirsin.";

export const COMMENT_REVIEW_QUEUE_EMPTY = {
  title: "İncelenecek yorum yok.",
  description: "Otomatik incelemenin karar veremediği bir yorum geldiğinde burada görünür.",
};

export function commentReviewOutcomeCopy(status: "approved" | "rejected", alreadyDecided: boolean): string {
  if (status === "approved") return alreadyDecided ? "Bu yorum zaten yayınlanmış." : "Yorum yayınlandı.";
  return alreadyDecided ? "Bu yorum için karar zaten verilmiş." : "Yorum yayınlanmadı.";
}

/** Said once above the queue: what these items are, and are not. */
export const REVIEW_QUEUE_TRUST_NOTE =
  "Bu ekranda, otomatik incelemenin kesin karar veremediği öğrenci yanıtlarını yayınlanmadan önce kontrol edebilirsin.";

export const REVIEW_QUEUE_TITLE = "Yanıt İncelemeleri";

export const REVIEW_QUEUE_EMPTY = {
  title: "İncelenecek yanıt yok.",
  description: "Otomatik incelemenin karar veremediği bir yanıt geldiğinde burada görünür.",
};

/** Publication vocabulary, not grading vocabulary. */
export const REVIEW_ACTION = {
  approve: "Yayınla",
  reject: "Yayınlama",
} as const;

export function reviewMethodCopy(method: "photo" | "drawing"): string {
  return method === "drawing" ? "Çizim" : "Fotoğraf";
}

export function reviewOutcomeCopy(status: "approved" | "rejected", alreadyDecided: boolean): string {
  if (status === "approved") return alreadyDecided ? "Bu yanıt zaten yayınlanmış." : "Yanıt yayınlandı.";
  return alreadyDecided ? "Bu yanıt için karar zaten verilmiş." : "Yanıt yayınlanmadı.";
}

/** Firebase error codes → safe Turkish copy. Never a raw message. */
export function mapAnswerReviewError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? "";
  const bare = code.startsWith("functions/") ? code.slice("functions/".length) : code;
  switch (bare) {
    case "unauthenticated":
      return "Bu işlem için giriş yapman gerekiyor.";
    case "permission-denied":
      return "Bu sınıfın yanıtlarını yalnızca sınıfın öğretmeni inceleyebilir.";
    case "not-found":
      return "Bu gönderi artık bulunamıyor.";
    case "failed-precondition":
      return "Bu gönderi için karar zaten verilmiş.";
    case "invalid-argument":
      return "İstek anlaşılamadı. Sayfayı yenileyip tekrar dene.";
    case "unavailable":
    case "deadline-exceeded":
      return "İnceleme şu anda kaydedilemedi. Daha sonra tekrar dene.";
    default:
      return "Bir sorun oluştu. Tekrar deneyebilirsin.";
  }
}
