import {
  clampUnreadCount,
  formatUnreadBadge,
  unreadBadgeAccessibilityLabel,
} from "@features/notifications/services/unreadBadge";

describe("formatUnreadBadge", () => {
  it("renders nothing (null) for zero", () => {
    expect(formatUnreadBadge(0)).toBeNull();
  });

  it("renders the exact number for 1-99", () => {
    expect(formatUnreadBadge(1)).toBe("1");
    expect(formatUnreadBadge(42)).toBe("42");
    expect(formatUnreadBadge(99)).toBe("99");
  });

  it("caps at 99+ beyond 99", () => {
    expect(formatUnreadBadge(100)).toBe("99+");
    expect(formatUnreadBadge(500)).toBe("99+");
  });

  it("never renders a negative badge — floors to null", () => {
    expect(formatUnreadBadge(-5)).toBeNull();
  });
});

describe("clampUnreadCount", () => {
  it("floors negative values to 0", () => {
    expect(clampUnreadCount(-1)).toBe(0);
    expect(clampUnreadCount(-1000)).toBe(0);
  });

  it("floors non-integer values down", () => {
    expect(clampUnreadCount(3.9)).toBe(3);
  });

  it("treats NaN/Infinity as 0", () => {
    expect(clampUnreadCount(NaN)).toBe(0);
    expect(clampUnreadCount(Infinity)).toBe(0);
  });

  it("passes through a normal positive integer unchanged", () => {
    expect(clampUnreadCount(7)).toBe(7);
  });
});

describe("unreadBadgeAccessibilityLabel", () => {
  it("states zero explicitly", () => {
    expect(unreadBadgeAccessibilityLabel(0)).toBe("Okunmamış bildirim yok");
  });

  it("uses singular phrasing for exactly one", () => {
    expect(unreadBadgeAccessibilityLabel(1)).toBe("1 okunmamış bildirim");
  });

  it("uses the count for more than one", () => {
    expect(unreadBadgeAccessibilityLabel(5)).toBe("5 okunmamış bildirim");
  });
});
