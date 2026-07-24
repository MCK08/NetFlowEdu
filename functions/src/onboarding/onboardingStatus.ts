export type OnboardingStatus = "pending" | "provisioning" | "complete";
export type OnboardingRole = "student" | "teacher";

// Legacy documents (created before onboardingStatus existed) have no such
// field at all — treated as "complete", never "pending". This is the single
// choke point both initializeOnboarding and completeOnboarding read through,
// so the "missing means complete, not pending" rule can never drift between
// the two.
export function resolveOnboardingStatus(raw: unknown): OnboardingStatus {
  return raw === "pending" || raw === "provisioning" ? raw : "complete";
}
