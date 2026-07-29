import { mapQuestionUploadErrorToMessage } from "@features/upload/services/questionUploadErrorMapper";

// Production incident: useStudentQuestionUpload.submitDetails used a bare
// `catch {}` that discarded the real error entirely and always showed
// "Soru yüklenemedi. Lütfen tekrar deneyin." — including for a genuine
// Firestore rules permission-denied, which is not a transient failure and
// "tekrar deneyin" (try again) can never fix it. This mapper is what the
// fixed catch block now calls instead of hardcoding that one string.
describe("mapQuestionUploadErrorToMessage", () => {
  const GENERIC = "Soru yüklenemedi. Lütfen tekrar deneyin.";

  it("maps a Firestore rules permission-denied to a distinct, non-generic message", () => {
    const message = mapQuestionUploadErrorToMessage({ code: "permission-denied" });
    expect(message).not.toBe(GENERIC);
    expect(message).toContain("izniniz yok");
  });

  it("maps a Storage rules unauthorized to the same permission wording as Firestore's", () => {
    const storage = mapQuestionUploadErrorToMessage({ code: "storage/unauthorized" });
    const firestore = mapQuestionUploadErrorToMessage({ code: "permission-denied" });
    expect(storage).toBe(firestore);
  });

  it("distinguishes a transient Storage retry failure from a permission failure", () => {
    const retry = mapQuestionUploadErrorToMessage({ code: "storage/retry-limit-exceeded" });
    expect(retry).not.toBe(GENERIC);
    expect(retry).toMatch(/tekrar deneyin/);
    expect(retry).not.toContain("izniniz yok");
  });

  it("falls back to the generic message for an unmapped Firebase code", () => {
    expect(mapQuestionUploadErrorToMessage({ code: "storage/some-unmapped-code" })).toBe(GENERIC);
  });

  it("falls back to the generic message for a non-Firebase error, without leaking its message", () => {
    const message = mapQuestionUploadErrorToMessage(new Error("some internal detail"));
    expect(message).toBe(GENERIC);
    expect(message).not.toContain("internal detail");
  });

  it("handles null/undefined safely", () => {
    expect(mapQuestionUploadErrorToMessage(null)).toBe(GENERIC);
    expect(mapQuestionUploadErrorToMessage(undefined)).toBe(GENERIC);
  });

  it("never leaks a raw Firebase error code to the user", () => {
    for (const code of ["permission-denied", "storage/unauthorized", "storage/quota-exceeded"]) {
      const message = mapQuestionUploadErrorToMessage({ code });
      expect(message).not.toContain(code);
    }
  });
});
