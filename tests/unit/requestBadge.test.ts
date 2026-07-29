import { formatRequestBadge } from "@features/friends/services/requestBadge";

describe("formatRequestBadge", () => {
  it("renders no badge for zero", () => {
    expect(formatRequestBadge(0)).toBeNull();
  });

  it("renders no badge for a negative count (defensive)", () => {
    expect(formatRequestBadge(-1)).toBeNull();
  });

  it("renders the exact number for 1-99", () => {
    expect(formatRequestBadge(1)).toBe("1");
    expect(formatRequestBadge(42)).toBe("42");
    expect(formatRequestBadge(99)).toBe("99");
  });

  it("renders '99+' for 100 and above", () => {
    expect(formatRequestBadge(100)).toBe("99+");
    expect(formatRequestBadge(250)).toBe("99+");
  });
});
