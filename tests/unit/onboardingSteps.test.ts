import {
  isOnboardingFinished,
  OnboardingProgressState,
  resolveOnboardingStep,
  stepAccessibilityLabel,
  stepCounterLabel,
  stepIndex,
  stepsForFlow,
} from "@features/authentication/services/onboardingSteps";

const FRESH: OnboardingProgressState = {
  hasAuthAccount: false,
  isEmailVerified: false,
  hasRequestedRole: false,
  onboardingStatus: null,
};

function state(overrides: Partial<OnboardingProgressState>): OnboardingProgressState {
  return { ...FRESH, ...overrides };
}

describe("stepsForFlow", () => {
  it("gives the password flow an account -> verification -> completion sequence", () => {
    expect(stepsForFlow("password").map((step) => step.id)).toEqual([
      "account",
      "verification",
      "completion",
    ]);
  });

  // Google already verified the address, so a "verification" step would be
  // a stage that can never apply — and the app DOES need a username/role,
  // which the password flow collects on the register form itself.
  it("gives the Google flow account -> profile -> completion, with no verification step", () => {
    const ids = stepsForFlow("google").map((step) => step.id);
    expect(ids).toEqual(["account", "profile", "completion"]);
    expect(ids).not.toContain("verification");
  });

  it("labels every step", () => {
    for (const flow of ["password", "google"] as const) {
      for (const step of stepsForFlow(flow)) {
        expect(step.label.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("resolveOnboardingStep — password flow", () => {
  it("starts at the account step before an Auth account exists", () => {
    expect(resolveOnboardingStep("password", FRESH)).toBe("account");
  });

  it("moves to verification once the account exists but the address is unverified", () => {
    expect(resolveOnboardingStep("password", state({ hasAuthAccount: true }))).toBe("verification");
  });

  // Stage 2 (completeOnboarding) is what actually grants the role, and it is
  // the verify-email screen's own retry button that drives it — so a
  // verified-but-still-pending account is still ON the verification step,
  // not finished.
  it("stays on verification while the address is verified but the role grant is still pending", () => {
    expect(
      resolveOnboardingStep(
        "password",
        state({ hasAuthAccount: true, isEmailVerified: true, onboardingStatus: "pending" }),
      ),
    ).toBe("verification");
    expect(
      resolveOnboardingStep(
        "password",
        state({ hasAuthAccount: true, isEmailVerified: true, onboardingStatus: "provisioning" }),
      ),
    ).toBe("verification");
  });

  it("reaches completion only once the server reports complete", () => {
    expect(
      resolveOnboardingStep(
        "password",
        state({
          hasAuthAccount: true,
          isEmailVerified: true,
          hasRequestedRole: true,
          onboardingStatus: "complete",
        }),
      ),
    ).toBe("completion");
  });
});

describe("resolveOnboardingStep — Google flow", () => {
  it("starts at the account step before an Auth account exists", () => {
    expect(resolveOnboardingStep("google", FRESH)).toBe("account");
  });

  // The exact state a brand-new Google sign-up is in: signed in, verified by
  // Google, but requestedRole is still null because initializeOnboarding has
  // never run for it.
  it("sends a brand-new Google account to the profile step", () => {
    expect(
      resolveOnboardingStep(
        "google",
        state({ hasAuthAccount: true, isEmailVerified: true, onboardingStatus: "pending" }),
      ),
    ).toBe("profile");
  });

  it("stays on the profile step while the role grant is still pending after submitting", () => {
    expect(
      resolveOnboardingStep(
        "google",
        state({
          hasAuthAccount: true,
          isEmailVerified: true,
          hasRequestedRole: true,
          onboardingStatus: "pending",
        }),
      ),
    ).toBe("profile");
  });

  it("reaches completion once the server reports complete", () => {
    expect(
      resolveOnboardingStep(
        "google",
        state({
          hasAuthAccount: true,
          isEmailVerified: true,
          hasRequestedRole: true,
          onboardingStatus: "complete",
        }),
      ),
    ).toBe("completion");
  });

  // A Google account's email is verified by Google itself, so this flag must
  // never hold it back the way it does in the password flow.
  it("never routes a Google account to a verification step, even if the flag is false", () => {
    expect(
      resolveOnboardingStep(
        "google",
        state({ hasAuthAccount: true, isEmailVerified: false, hasRequestedRole: true, onboardingStatus: "complete" }),
      ),
    ).toBe("completion");
  });
});

describe("legacy accounts", () => {
  // resolveOnboardingStatus maps every unknown/absent raw value to
  // "complete", so an account created before the field existed reads as
  // finished — it must never be shown mid-onboarding chrome.
  it("treats a legacy completed account as finished in both flows", () => {
    const legacy = state({
      hasAuthAccount: true,
      isEmailVerified: true,
      hasRequestedRole: true,
      onboardingStatus: "complete",
    });
    expect(resolveOnboardingStep("password", legacy)).toBe("completion");
    expect(resolveOnboardingStep("google", legacy)).toBe("completion");
    expect(isOnboardingFinished(legacy)).toBe(true);
  });

  it("does not report a signed-out session as finished", () => {
    expect(isOnboardingFinished(state({ onboardingStatus: "complete" }))).toBe(false);
  });

  it("does not report a pending account as finished", () => {
    expect(
      isOnboardingFinished(state({ hasAuthAccount: true, onboardingStatus: "pending" })),
    ).toBe(false);
  });
});

describe("step labels and counters", () => {
  it("counts real steps and never emits a percentage", () => {
    expect(stepCounterLabel("password", "account")).toBe("Adım 1 / 3");
    expect(stepCounterLabel("password", "verification")).toBe("Adım 2 / 3");
    expect(stepCounterLabel("password", "completion")).toBe("Adım 3 / 3");
    expect(stepCounterLabel("google", "profile")).toBe("Adım 2 / 3");
    expect(stepCounterLabel("password", "account")).not.toContain("%");
  });

  // "profile" is not part of the password flow; printing "Adım 0 / 3" or a
  // negative index would be worse than naming the step.
  it("falls back to the step name rather than a bogus position for a step outside the flow", () => {
    expect(stepIndex("password", "profile")).toBe(-1);
    expect(stepCounterLabel("password", "profile")).toBe("Profil");
    expect(stepAccessibilityLabel("password", "profile")).toBe("Profil");
  });

  it("announces both the position and the step name", () => {
    expect(stepAccessibilityLabel("password", "verification")).toBe("Adım 2 / 3: Doğrulama");
    expect(stepAccessibilityLabel("google", "profile")).toBe("Adım 2 / 3: Profil");
  });
});
