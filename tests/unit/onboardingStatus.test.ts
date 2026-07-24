import { resolveOnboardingStatus } from "../../functions/src/onboarding/onboardingStatus";

describe("resolveOnboardingStatus", () => {
  it("passes through 'pending'", () => {
    expect(resolveOnboardingStatus("pending")).toBe("pending");
  });

  it("passes through 'provisioning'", () => {
    expect(resolveOnboardingStatus("provisioning")).toBe("provisioning");
  });

  it("passes through 'complete'", () => {
    expect(resolveOnboardingStatus("complete")).toBe("complete");
  });

  // The exact mechanism Blocker 1 depends on: a legacy document (created
  // before onboardingStatus existed) has this field entirely absent, which
  // must resolve to "complete" — never "pending" — so it can never re-enter
  // the role-selection path.
  it("treats a missing field (undefined) as 'complete', not 'pending'", () => {
    expect(resolveOnboardingStatus(undefined)).toBe("complete");
  });

  it("treats null as 'complete'", () => {
    expect(resolveOnboardingStatus(null)).toBe("complete");
  });

  it("treats an unrecognized/garbage value as 'complete', failing closed", () => {
    expect(resolveOnboardingStatus("some-corrupted-value")).toBe("complete");
    expect(resolveOnboardingStatus(123)).toBe("complete");
    expect(resolveOnboardingStatus({})).toBe("complete");
  });
});
