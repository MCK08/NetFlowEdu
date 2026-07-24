import { ROUTES } from "@constants/routes";
import { UserRole } from "@/types/user";
import { OnboardingStatus } from "@utils/onboardingStatus";

export type ResolvedRoute = (typeof ROUTES)[keyof typeof ROUTES] | "/unknown-role";

export interface RouteResolutionState {
  isAuthenticated: boolean;
  isEmailVerified: boolean;
  role: UserRole | null;
  // Optional — omitted (or a terminal "complete") behaves exactly as before
  // this field existed. Only "pending"/"provisioning" changes the outcome.
  onboardingStatus?: OnboardingStatus | null;
}

// Centralized so every entry point (root guard, deep links, back navigation)
// agrees on where a given auth state should land. Pure function, no
// Firebase/React dependency, so it's cheap to unit test exhaustively.
export function resolveRouteForState(state: RouteResolutionState): ResolvedRoute {
  if (!state.isAuthenticated) {
    return ROUTES.login;
  }

  if (!state.isEmailVerified) {
    return ROUTES.verifyEmail;
  }

  // A verified email whose Stage-2 role/claim grant (completeOnboarding)
  // hasn't actually completed yet must not fall through to the role switch
  // below: `role` is still whatever onUserCreate defaulted it to
  // ("student") until Stage 2 promotes it, which would otherwise silently
  // strand a would-be teacher in the student dashboard with no way back to
  // a retry action. Routing back to verify-email — the same screen, same
  // idempotent "check again" button — is what lets onboarding actually
  // converge instead of getting stuck in "pending" forever.
  if (state.onboardingStatus === "pending" || state.onboardingStatus === "provisioning") {
    return ROUTES.verifyEmail;
  }

  switch (state.role) {
    case "student":
      return ROUTES.student;
    case "teacher":
      return ROUTES.teacher;
    case "organization_admin":
    case "platform_admin":
      return ROUTES.admin;
    default:
      // Fail closed: an authenticated, verified user with no recognized
      // role never falls through to a default dashboard.
      return "/unknown-role";
  }
}
