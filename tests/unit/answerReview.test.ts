import {
  buildPublishedAnswerDocument,
  extractDownloadToken,
  storageDownloadBase,
} from "../../functions/src/moderation/answerFinalization";
import { buildDownloadUrl, buildReviewAccessPath } from "../../functions/src/moderation/answerPublication";
import { HUMAN_REVIEWABLE_STATES, REVIEW_QUEUE_PAGE_SIZE } from "../../functions/src/review/answerReview";
import { canTransition, MODERATION_STATES } from "../../functions/src/moderation/moderationStates";
import {
  mapAnswerReviewError,
  REVIEW_ACTION,
  REVIEW_QUEUE_EMPTY,
  reviewMethodCopy,
  reviewOutcomeCopy,
  reviewReasonCopy,
} from "../../src/features/teacher/services/answerReviewCopy";

// Phase 97 — the pure edges of class-scoped answer review.

describe("the published answer document is one shape", () => {
  it("carries exactly the fields the feed, likes and onAnswerCreate read", () => {
    const doc = buildPublishedAnswerDocument({
      questionId: "q1",
      ownerId: "s1",
      imageUrl: "https://x/y?alt=media&token=t",
      method: "photo",
      now: 1_700_000_000_000,
    });
    expect(Object.keys(doc).sort()).toEqual(["createdAt", "imageUrl", "likeCount", "method", "ownerId", "questionId"]);
    expect(doc.likeCount).toBe(0);
    expect(doc.createdAt).toEqual(new Date(1_700_000_000_000));
    // No review metadata leaks into the public document.
    expect(doc).not.toHaveProperty("reviewedBy");
    expect(doc).not.toHaveProperty("reviewedAt");
    expect(doc).not.toHaveProperty("submissionId");
  });

  it("is deterministic for identical inputs", () => {
    const input = { questionId: "q", ownerId: "o", imageUrl: "u", method: "drawing" as const, now: 5 };
    expect(buildPublishedAnswerDocument(input)).toEqual(buildPublishedAnswerDocument(input));
  });
});

describe("download URLs", () => {
  it("default to production and can be pointed at the emulator", () => {
    expect(buildDownloadUrl("b", "a/b c.png", "tok")).toBe(
      "https://firebasestorage.googleapis.com/v0/b/b/o/a%2Fb%20c.png?alt=media&token=tok",
    );
    expect(buildDownloadUrl("b", "p", "tok", "http://127.0.0.1:9199")).toBe(
      "http://127.0.0.1:9199/v0/b/b/o/p?alt=media&token=tok",
    );
  });

  it("resolve the base from the emulator host when present", () => {
    const previous = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
    delete process.env.FIREBASE_STORAGE_EMULATOR_HOST;
    expect(storageDownloadBase()).toBe("https://firebasestorage.googleapis.com");
    process.env.FIREBASE_STORAGE_EMULATOR_HOST = "127.0.0.1:9199";
    expect(storageDownloadBase()).toBe("http://127.0.0.1:9199");
    if (previous === undefined) delete process.env.FIREBASE_STORAGE_EMULATOR_HOST;
    else process.env.FIREBASE_STORAGE_EMULATOR_HOST = previous;
  });

  it("extractDownloadToken reads the token back, or null", () => {
    expect(extractDownloadToken("https://h/o/p?alt=media&token=abc-123")).toBe("abc-123");
    expect(extractDownloadToken("https://h/o/p?token=x%2Fy&alt=media")).toBe("x/y");
    expect(extractDownloadToken("https://h/o/p?alt=media")).toBeNull();
    expect(extractDownloadToken(null)).toBeNull();
  });

  it("review copies live under a client-unreadable path keyed by submission", () => {
    expect(buildReviewAccessPath("u1_op", "image/png")).toBe("moderation/review/u1_op/upload.png");
    expect(buildReviewAccessPath("u1_op", "image/jpeg")).toBe("moderation/review/u1_op/upload.jpg");
  });
});

describe("what a human may rule on", () => {
  it("is manual_review and nothing else", () => {
    expect(HUMAN_REVIEWABLE_STATES).toEqual(["manual_review"]);
  });

  it("manual_review may go to approved or rejected; final decisions stay final", () => {
    expect(canTransition("manual_review", "approved")).toBe(true);
    expect(canTransition("manual_review", "rejected")).toBe(true);
    expect(canTransition("rejected", "approved")).toBe(false);
    expect(canTransition("approved", "rejected")).toBe(false);
    expect(canTransition("removed", "approved")).toBe(false);
    // An explicit automated refusal is never reopened by a reviewer.
    for (const state of MODERATION_STATES) {
      if (state === "rejected") expect(canTransition(state, "manual_review")).toBe(false);
    }
  });

  it("the queue page is small and bounded", () => {
    expect(REVIEW_QUEUE_PAGE_SIZE).toBe(20);
  });
});

describe("teacher-facing copy", () => {
  it("describes the automated check, never the student", () => {
    for (const reason of ["provider_unavailable", "no_image_provider", "no_ocr_provider", "uncertain", "something_new"]) {
      const copy = reviewReasonCopy(reason);
      expect(copy).toMatch(/Otomatik inceleme|otomatik/i);
      expect(copy).not.toMatch(/güvensiz|şüpheli|tehlikeli|riskli|öğrenci/i);
    }
    expect(reviewReasonCopy("provider_unavailable")).toBe("Otomatik inceleme şu anda tamamlanamadı.");
    expect(reviewReasonCopy("uncertain")).toBe("Otomatik inceleme bu yanıt için kesin karar veremedi.");
  });

  it("uses publication vocabulary, not grading vocabulary", () => {
    expect(REVIEW_ACTION.approve).toBe("Yayınla");
    expect(REVIEW_ACTION.reject).toBe("Yayınlama");
    for (const text of [REVIEW_ACTION.approve, REVIEW_ACTION.reject, reviewOutcomeCopy("approved", false), reviewOutcomeCopy("rejected", false)]) {
      expect(text).not.toMatch(/doğru|yanlış|başarılı|başarısız/i);
    }
  });

  it("the empty state claims only what is known", () => {
    expect(REVIEW_QUEUE_EMPTY.title).toBe("İncelenecek yanıt yok.");
    expect(REVIEW_QUEUE_EMPTY.description).not.toMatch(/güvenli|onaylandı/i);
  });

  it("outcomes distinguish a fresh decision from an already-recorded one", () => {
    expect(reviewOutcomeCopy("approved", false)).toBe("Yanıt yayınlandı.");
    expect(reviewOutcomeCopy("approved", true)).toBe("Bu yanıt zaten yayınlanmış.");
    expect(reviewOutcomeCopy("rejected", true)).toBe("Bu yanıt için karar zaten verilmiş.");
    expect(reviewMethodCopy("photo")).toBe("Fotoğraf");
    expect(reviewMethodCopy("drawing")).toBe("Çizim");
  });

  it("maps callable errors to safe sentences", () => {
    expect(mapAnswerReviewError({ code: "functions/permission-denied" })).toContain("sınıfın öğretmeni");
    expect(mapAnswerReviewError({ code: "functions/failed-precondition" })).toContain("zaten");
    expect(mapAnswerReviewError({ code: "functions/not-found" })).toContain("bulunamıyor");
    expect(mapAnswerReviewError(new Error("raw internal path /x/y"))).not.toContain("/x/y");
  });
});
