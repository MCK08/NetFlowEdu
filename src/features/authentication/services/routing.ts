import { ROUTES } from "@constants/routes";
import { UserRole } from "@/types/user";

export type ResolvedRoute = (typeof ROUTES)[keyof typeof ROUTES] | "/unknown-role";

export interface RouteResolutionState {
  isAuthenticated: boolean;
  isEmailVerified: boolean;
  role: UserRole | null;
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
