import {
  mapAssignmentPrepareError,
  mapAssignmentPublishError,
} from "../../src/features/assignments/services/assignmentPublishMessages";

describe("mapAssignmentPublishError", () => {
  it("maps permission-denied to a safe, specific Turkish message", () => {
    expect(mapAssignmentPublishError({ code: "permission-denied" })).toBe(
      "Ödev oluşturma yetkiniz doğrulanamadı.",
    );
  });

  it("maps not-found to a class-specific message", () => {
    expect(mapAssignmentPublishError({ code: "not-found" })).toBe("Bu sınıf artık mevcut değil.");
  });

  it("falls back to the generic message for an unknown/unmapped code", () => {
    expect(mapAssignmentPublishError({ code: "internal" })).toBe("Ödev oluşturulamadı. Lütfen tekrar deneyin.");
    expect(mapAssignmentPublishError(new Error("boom"))).toBe("Ödev oluşturulamadı. Lütfen tekrar deneyin.");
    expect(mapAssignmentPublishError(null)).toBe("Ödev oluşturulamadı. Lütfen tekrar deneyin.");
  });

  it("never echoes the raw Firebase message", () => {
    const raw = mapAssignmentPublishError({
      code: "permission-denied",
      message: "PERMISSION_DENIED: false for 'create' @ L765",
    });
    expect(raw).not.toContain("L765");
    expect(raw).not.toContain("PERMISSION_DENIED");
  });
});

describe("mapAssignmentPrepareError", () => {
  it("maps permission-denied to a prepare-specific message", () => {
    expect(mapAssignmentPrepareError({ code: "permission-denied" })).toBe(
      "Bu sınıfın sorularını görüntüleme yetkiniz doğrulanamadı.",
    );
  });

  it("falls back to the generic prepare message", () => {
    expect(mapAssignmentPrepareError({ code: "unknown" })).toBe("Sorular hazırlanamadı. Lütfen tekrar deneyin.");
  });
});
