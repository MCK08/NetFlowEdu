// Pure so it's unit-testable without the Admin SDK — see
// tests/unit/onboardingOrganizationName.test.ts. A teacher's personal
// workspace is always named after them; there's no user-facing "kurum adı"
// input anymore (see completeOnboarding.ts's doc comment on why).
export function buildOrganizationName(displayName: string): string {
  return `${displayName} Sınıfları`;
}
