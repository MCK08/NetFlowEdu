import {
  formatNextReview,
  goalProgress,
  goalProgressLabel,
  OUTCOME_OPTIONS,
  queueEmptyCopy,
  REVIEW_ADVANCE_DELAY_MS,
  streakLabel,
  studyStatusLabel,
} from "@features/study/services/studyPresentation";
import { mapStudyErrorToMessage } from "@features/study/services/studyErrorMapper";
import { FirebaseError } from "firebase/app";

const NOW = 1_760_000_000_000;
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("REVIEW_ADVANCE_DELAY_MS", () => {
  // Phase 18 spec: "yaklaşık 300–500 ms sonra otomatik sonraki soruya
  // geçilecek" — pins the constant to that window so a future tweak can't
  // silently drift outside the specified feel (too fast to register as a
  // confirmation, or too slow to feel brisk over a long queue).
  it("falls within the specified 300-500ms window", () => {
    expect(REVIEW_ADVANCE_DELAY_MS).toBeGreaterThanOrEqual(300);
    expect(REVIEW_ADVANCE_DELAY_MS).toBeLessThanOrEqual(500);
  });
});

describe("OUTCOME_OPTIONS", () => {
  it("exposes exactly the three outcomes, hardest first", () => {
    expect(OUTCOME_OPTIONS.map((o) => o.outcome)).toEqual(["again", "struggled", "solved"]);
  });

  it("uses the specified Turkish labels", () => {
    expect(OUTCOME_OPTIONS.map((o) => o.label)).toEqual(["Tekrar Et", "Zorlandım", "Çözdüm"]);
  });

  it("gives every option a non-empty accessibility hint", () => {
    for (const option of OUTCOME_OPTIONS) {
      expect(option.accessibilityHint.length).toBeGreaterThan(0);
    }
  });
});

describe("studyStatusLabel", () => {
  it("maps every status to Turkish copy", () => {
    expect(studyStatusLabel("learning")).toBe("Öğreniliyor");
    expect(studyStatusLabel("review")).toBe("Tekrarda");
    expect(studyStatusLabel("mastered")).toBe("Ustalaşıldı");
  });
});

describe("formatNextReview", () => {
  it("says ready when due now or overdue", () => {
    expect(formatNextReview(NOW, NOW)).toBe("Şimdi hazır");
    expect(formatNextReview(NOW - DAY, NOW)).toBe("Şimdi hazır");
  });

  it("uses minutes under an hour", () => {
    expect(formatNextReview(NOW + 10 * MINUTE, NOW)).toBe("10 dakika sonra");
  });

  it("never says '0 dakika' for a sub-minute delay", () => {
    expect(formatNextReview(NOW + 1000, NOW)).toBe("1 dakika sonra");
  });

  it("uses hours under a day", () => {
    expect(formatNextReview(NOW + 5 * HOUR, NOW)).toBe("5 saat sonra");
  });

  it("uses days beyond that", () => {
    expect(formatNextReview(NOW + 2 * DAY, NOW)).toBe("2 gün sonra");
    expect(formatNextReview(NOW + 60 * DAY, NOW)).toBe("60 gün sonra");
  });
});

describe("goalProgress", () => {
  it("computes a 0..1 ratio", () => {
    expect(goalProgress(0, 10)).toBe(0);
    expect(goalProgress(5, 10)).toBe(0.5);
    expect(goalProgress(10, 10)).toBe(1);
  });

  it("clamps an over-achieved day to 1 so a progress bar cannot overflow", () => {
    expect(goalProgress(25, 10)).toBe(1);
  });

  it("returns 0 for a zero/negative/NaN goal instead of dividing by zero", () => {
    expect(goalProgress(5, 0)).toBe(0);
    expect(goalProgress(5, -3)).toBe(0);
    expect(goalProgress(5, Number.NaN)).toBe(0);
  });

  it("treats a negative review count as 0", () => {
    expect(goalProgress(-4, 10)).toBe(0);
  });
});

describe("goalProgressLabel", () => {
  it("renders reviewed / goal", () => {
    expect(goalProgressLabel(3, 10)).toBe("3 / 10");
  });

  it("normalizes garbage values instead of printing NaN", () => {
    expect(goalProgressLabel(Number.NaN, 10)).toBe("0 / 10");
    expect(goalProgressLabel(3, Number.NaN)).toBe("3 / 0");
  });
});

describe("streakLabel", () => {
  it("states when there is no streak", () => {
    expect(streakLabel(0)).toBe("Seri yok");
    expect(streakLabel(-2)).toBe("Seri yok");
  });

  it("uses one Turkish form for any count", () => {
    expect(streakLabel(1)).toBe("1 günlük seri");
    expect(streakLabel(12)).toBe("12 günlük seri");
  });
});

describe("queueEmptyCopy", () => {
  it("explains how to ADD questions when the student has never studied", () => {
    const copy = queueEmptyCopy(false);
    expect(copy.title).toBe("Çalışma kuyruğun boş");
    expect(copy.description).toContain("Çözdüm");
  });

  it("says the day is done when items exist but none are due", () => {
    const copy = queueEmptyCopy(true);
    expect(copy.title).toBe("Bugünlük tekrar kalmadı");
  });
});

describe("mapStudyErrorToMessage", () => {
  const cases: [string, string][] = [
    ["unauthenticated", "Oturumunuz bulunamadı. Lütfen tekrar giriş yapın."],
    ["permission-denied", "Bu soruya erişim izniniz yok."],
    ["not-found", "Bu soru artık mevcut değil."],
    ["internal", "Sunucu tarafında bir hata oluştu. Lütfen daha sonra tekrar deneyin."],
    ["unavailable", "Bağlantı sorunu. Lütfen tekrar deneyin."],
  ];

  it.each(cases)("maps %s to specific Turkish copy", (code, expected) => {
    expect(mapStudyErrorToMessage(new FirebaseError(code, "raw"))).toBe(expected);
  });

  it("normalizes the callable 'functions/' prefix to the same message", () => {
    expect(mapStudyErrorToMessage(new FirebaseError("functions/permission-denied", "raw"))).toBe(
      mapStudyErrorToMessage(new FirebaseError("permission-denied", "raw")),
    );
  });

  it("never leaks a raw code into user-facing copy", () => {
    const message = mapStudyErrorToMessage(new FirebaseError("functions/internal", "boom"));
    expect(message).not.toContain("functions/");
    expect(message).not.toContain("internal");
    expect(message).not.toContain("boom");
  });

  it("falls back generically only for a genuinely unknown code", () => {
    expect(mapStudyErrorToMessage(new FirebaseError("brand-new-code", "raw"))).toBe(
      "Çalışma kaydedilemedi. Lütfen tekrar deneyin.",
    );
    expect(mapStudyErrorToMessage(new Error("plain"))).toBe(
      "Çalışma kaydedilemedi. Lütfen tekrar deneyin.",
    );
  });
});
