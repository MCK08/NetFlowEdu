import { resolveOnboardingStatus } from "@utils/onboardingStatus";

// Mirrors tests/unit/onboardingStatus.test.ts (the Cloud Functions side) —
// same inputs, same expected outputs, so the client and server copies of
// this pure function can never silently drift apart.
describe("resolveOnboardingStatus (client)", () => {
  it("passes through 'pending'", () => {
    expect(resolveOnboardingStatus("pending")).toBe("pending");
  });

  it("passes through 'provisioning'", () => {
    expect(resolveOnboardingStatus("provisioning")).toBe("provisioning");
  });

  it("passes through 'complete'", () => {
    expect(resolveOnboardingStatus("complete")).toBe("complete");
  });

  it("treats a missing field (undefined) as 'complete', not 'pending' — legacy accounts", () => {
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
