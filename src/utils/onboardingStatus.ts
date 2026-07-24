export type OnboardingStatus = "pending" | "provisioning" | "complete";

// Client-side mirror of functions/src/onboarding/onboardingStatus.ts's
// resolveOnboardingStatus. Duplicated deliberately rather than imported —
// the Cloud Functions codebase is a separate TypeScript project (its own
// tsconfig/build/runtime) that the Expo app cannot import across. Both
// sides are unit-tested against the exact same inputs (see
// tests/unit/onboardingStatus.test.ts for the Cloud Functions side and
// tests/unit/clientOnboardingStatus.test.ts for this one) so they can't
// silently drift apart.
export function resolveOnboardingStatus(raw: unknown): OnboardingStatus {
  return raw === "pending" || raw === "provisioning" ? raw : "complete";
}
