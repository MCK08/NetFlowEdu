import { FirebaseError } from "firebase/app";

import { mapNotificationErrorToMessage } from "@features/notifications/services/notificationErrorMapper";

function firebaseError(code: string): FirebaseError {
  return new FirebaseError(code, "raw message");
}

describe("mapNotificationErrorToMessage", () => {
  it("maps unauthenticated", () => {
    expect(mapNotificationErrorToMessage(firebaseError("unauthenticated"))).toBe(
      "Oturumunuz bulunamadı. Lütfen tekrar giriş yapın.",
    );
  });

  it("maps permission-denied", () => {
    expect(mapNotificationErrorToMessage(firebaseError("permission-denied"))).toBe(
      "Bu bildirimlere erişim izniniz yok.",
    );
  });

  it("maps unavailable", () => {
    expect(mapNotificationErrorToMessage(firebaseError("unavailable"))).toBe(
      "Bağlantı sorunu. Lütfen tekrar deneyin.",
    );
  });

  it("maps deadline-exceeded", () => {
    expect(mapNotificationErrorToMessage(firebaseError("deadline-exceeded"))).toBe(
      "İşlem zaman aşımına uğradı. Lütfen tekrar deneyin.",
    );
  });

  it("maps not-found", () => {
    expect(mapNotificationErrorToMessage(firebaseError("not-found"))).toBe("Bildirim bulunamadı.");
  });

  it("maps failed-precondition", () => {
    expect(mapNotificationErrorToMessage(firebaseError("failed-precondition"))).toBe(
      "Bu işlem şu anda tamamlanamadı. Lütfen tekrar deneyin.",
    );
  });

  it("maps resource-exhausted", () => {
    expect(mapNotificationErrorToMessage(firebaseError("resource-exhausted"))).toBe(
      "Çok fazla istek gönderildi. Lütfen biraz sonra tekrar deneyin.",
    );
  });

  it("normalizes callable-prefixed codes (functions/permission-denied) to the same message as the bare Firestore code", () => {
    expect(mapNotificationErrorToMessage(firebaseError("functions/permission-denied"))).toBe(
      mapNotificationErrorToMessage(firebaseError("permission-denied")),
    );
  });

  it("falls back to the default message for an unknown code", () => {
    expect(mapNotificationErrorToMessage(firebaseError("something-new"))).toBe(
      "Bildirimler yüklenirken bir sorun oluştu. Lütfen tekrar deneyin.",
    );
  });

  it("never leaks a raw Firebase code into the returned message", () => {
    const message = mapNotificationErrorToMessage(firebaseError("permission-denied"));
    expect(message).not.toContain("permission-denied");
  });

  it("falls back to the default message for a non-Firebase error", () => {
    expect(mapNotificationErrorToMessage(new Error("boom"))).toBe(
      "Bildirimler yüklenirken bir sorun oluştu. Lütfen tekrar deneyin.",
    );
  });
});
