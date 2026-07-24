const calls: string[] = [];

const mockReloadCurrentUser = jest.fn(async () => {
  calls.push("reload");
});
const mockRefreshIdToken = jest.fn(async () => {
  calls.push("getIdToken(true)");
});
const mockCompleteOnboarding = jest.fn(async () => {
  calls.push("completeOnboarding");
  return { role: "teacher", organizationId: "org-1", onboardingStatus: "complete" as const };
});

jest.mock("@services/firebase/auth", () => ({
  reloadCurrentUser: () => mockReloadCurrentUser(),
  refreshIdToken: () => mockRefreshIdToken(),
}));

jest.mock("@services/firebase/functions", () => ({
  completeOnboarding: () => mockCompleteOnboarding(),
}));

// eslint-disable-next-line import/first
import { verifyAndCompleteOnboarding } from "@features/authentication/services/onboardingSession";
// eslint-disable-next-line import/first
import { User } from "firebase/auth";

function makeUser(emailVerified: boolean): User {
  return { emailVerified } as User;
}

describe("verifyAndCompleteOnboarding — refresh order (audited requirement)", () => {
  beforeEach(() => {
    calls.length = 0;
    mockReloadCurrentUser.mockReset().mockImplementation(async () => {
      calls.push("reload");
    });
    mockRefreshIdToken.mockReset().mockImplementation(async () => {
      calls.push("getIdToken(true)");
    });
    mockCompleteOnboarding.mockReset().mockImplementation(async () => {
      calls.push("completeOnboarding");
      return { role: "teacher", organizationId: "org-1", onboardingStatus: "complete" as const };
    });
  });

  it("runs reload -> getIdToken(true) -> completeOnboarding -> getIdToken(true), in exactly that order, for a verified user", async () => {
    await verifyAndCompleteOnboarding(makeUser(true));

    expect(calls).toEqual([
      "reload",
      "getIdToken(true)",
      "completeOnboarding",
      "getIdToken(true)",
    ]);
  });

  it("refreshes the token a second time only AFTER completeOnboarding resolves, not before", async () => {
    const order: string[] = [];
    mockCompleteOnboarding.mockImplementationOnce(async () => {
      order.push("completeOnboarding-start");
      await Promise.resolve();
      order.push("completeOnboarding-end");
      return { role: "teacher", organizationId: "org-1", onboardingStatus: "complete" as const };
    });
    mockRefreshIdToken.mockImplementation(async () => {
      order.push(`getIdToken(true)#${order.filter((o) => o.startsWith("getIdToken")).length + 1}`);
    });

    await verifyAndCompleteOnboarding(makeUser(true));

    const secondRefreshIndex = order.indexOf("getIdToken(true)#2");
    const completeEndIndex = order.indexOf("completeOnboarding-end");
    expect(secondRefreshIndex).toBeGreaterThan(completeEndIndex);
  });

  it("still reloads and refreshes the token once even for an unverified user, but never calls completeOnboarding", async () => {
    await verifyAndCompleteOnboarding(makeUser(false));

    expect(calls).toEqual(["reload", "getIdToken(true)"]);
    expect(mockCompleteOnboarding).not.toHaveBeenCalled();
  });

  it("does not throw when completeOnboarding fails, and never loops — exactly one attempt per call", async () => {
    mockCompleteOnboarding.mockRejectedValueOnce(new Error("network error"));

    await expect(verifyAndCompleteOnboarding(makeUser(true))).resolves.toBeUndefined();

    expect(mockCompleteOnboarding).toHaveBeenCalledTimes(1);
    // The post-completion refresh is skipped when completeOnboarding
    // itself threw — nothing to refresh for — but the pre-refresh (the one
    // before completeOnboarding) still happened.
    expect(mockRefreshIdToken).toHaveBeenCalledTimes(1);
  });

  it("a second, independent call is safe (no shared state, no accumulating loop)", async () => {
    await verifyAndCompleteOnboarding(makeUser(true));
    await verifyAndCompleteOnboarding(makeUser(true));

    expect(mockCompleteOnboarding).toHaveBeenCalledTimes(2);
    expect(mockReloadCurrentUser).toHaveBeenCalledTimes(2);
  });
});
