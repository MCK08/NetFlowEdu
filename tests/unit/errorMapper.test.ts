import { mapAuthErrorToMessage } from "@features/authentication/services/errorMapper";

describe("mapAuthErrorToMessage", () => {
  it("maps known Firebase Auth error codes to Turkish messages", () => {
    expect(mapAuthErrorToMessage({ code: "auth/invalid-email" })).toBe(
      "Geçerli bir e-posta adresi girin.",
    );
    expect(mapAuthErrorToMessage({ code: "auth/email-already-in-use" })).toBe(
      "Bu e-posta adresi zaten kullanımda.",
    );
    expect(mapAuthErrorToMessage({ code: "auth/weak-password" })).toBe(
      "Şifre çok zayıf. Daha güçlü bir şifre seçin.",
    );
    expect(mapAuthErrorToMessage({ code: "auth/invalid-credential" })).toBe(
      "E-posta veya şifre hatalı.",
    );
    expect(mapAuthErrorToMessage({ code: "auth/user-disabled" })).toBe(
      "Bu hesap devre dışı bırakılmış.",
    );
    expect(mapAuthErrorToMessage({ code: "auth/too-many-requests" })).toBe(
      "Çok fazla deneme yapıldı. Lütfen daha sonra tekrar deneyin.",
    );
    expect(mapAuthErrorToMessage({ code: "auth/network-request-failed" })).toBe(
      "Bağlantı hatası. İnternet bağlantınızı kontrol edin.",
    );
  });

  it("maps auth/user-token-expired and the continue-uri codes (unreachable today, but mapped defensively)", () => {
    expect(mapAuthErrorToMessage({ code: "auth/user-token-expired" })).toBe(
      "Oturumunuzun süresi doldu. Lütfen tekrar giriş yapın.",
    );
    expect(mapAuthErrorToMessage({ code: "auth/invalid-continue-uri" })).not.toBe(
      "Bir şeyler ters gitti. Lütfen tekrar deneyin.",
    );
    expect(mapAuthErrorToMessage({ code: "auth/unauthorized-continue-uri" })).not.toBe(
      "Bir şeyler ters gitti. Lütfen tekrar deneyin.",
    );
    expect(mapAuthErrorToMessage({ code: "auth/missing-continue-uri" })).not.toBe(
      "Bir şeyler ters gitti. Lütfen tekrar deneyin.",
    );
  });

  it("maps a null current-user (no signed-in Auth user) to a controlled, understandable message rather than a generic/no error", () => {
    const message = mapAuthErrorToMessage(new Error("NO_CURRENT_USER"));
    expect(message).toBe("Oturumunuz bulunamadı. Lütfen tekrar giriş yapın.");
  });

  it("falls back to a generic message for unknown codes", () => {
    expect(mapAuthErrorToMessage({ code: "auth/some-unmapped-code" })).toBe(
      "Bir şeyler ters gitti. Lütfen tekrar deneyin.",
    );
  });

  it("never leaks a raw error code or message for non-Firebase errors", () => {
    const message = mapAuthErrorToMessage(new Error("some internal detail"));
    expect(message).toBe("Bir şeyler ters gitti. Lütfen tekrar deneyin.");
    expect(message).not.toContain("internal detail");
  });

  it("handles null/undefined safely", () => {
    expect(mapAuthErrorToMessage(null)).toBe("Bir şeyler ters gitti. Lütfen tekrar deneyin.");
    expect(mapAuthErrorToMessage(undefined)).toBe("Bir şeyler ters gitti. Lütfen tekrar deneyin.");
  });
});
