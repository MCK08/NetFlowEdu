import { UserRole } from "@/types/user";
import { OnboardingStatus } from "@utils/onboardingStatus";

import { ResolvedRoute, resolveRouteForState } from "./routing";
import { isAtAnyTarget, isAtTarget, PUBLIC_AUTH_ROUTES } from "./routeTarget";

export interface RouteGuardAuthState {
  // False while AuthProvider hasn't settled yet (initial onAuthStateChanged
  // hasn't fired, or a verified+authenticated user's profile is still
  // loading). RouteGuard must never navigate while this is false — doing so
  // was the source of past races where a still-loading state briefly looked
  // like "logged out" and got redirected before the real state arrived.
  settledEnoughToRoute: boolean;
  // Matches AuthProvider's actual profileError type (a message string, or
  // null when there's no error) — only its truthiness is used here.
  profileError: string | null;
  isAuthenticated: boolean;
  isEmailVerified: boolean;
  role: UserRole | null;
  onboardingStatus?: OnboardingStatus | null;
  claimsSynced?: boolean;
  hasRequestedRole?: boolean;
}

// The single decision RouteGuard's effect makes each time it runs: either
// `null` (stay put, nothing to do) or the route to router.replace() to.
// Extracted out of the component specifically so it's directly unit-testable
// — including exhaustive state×screen matrices and navigation-loop
// simulation (see routeGuardDecision.test.ts) — without mounting React or
// expo-router, which this test setup doesn't transform. RouteGuard.tsx is a
// thin consumer: call this once per render with the current segments and,
// if it returns non-null, call router.replace(target). Keeping the logic
// here (not duplicated in tests) means a test that "passes" only passes
// because the real behavior is actually correct, never because a
// reimplementation happens to agree with itself.
export function decideRouteGuardTarget(
  state: RouteGuardAuthState,
  segments: string[],
): ResolvedRoute | null {
  if (!state.settledEnoughToRoute) return null;

  if (state.profileError) {
    return isAtTarget("/unknown-role", segments) ? null : "/unknown-role";
  }

  const target = resolveRouteForState({
    isAuthenticated: state.isAuthenticated,
    isEmailVerified: state.isEmailVerified,
    role: state.role,
    onboardingStatus: state.onboardingStatus,
    claimsSynced: state.claimsSynced,
    hasRequestedRole: state.hasRequestedRole,
  });

  // resolveRouteForState always resolves "unauthenticated" to the single
  // literal ROUTES.login — but login, register, and forgot-password are ALL
  // valid places for an unauthenticated user to be (see PUBLIC_AUTH_ROUTES's
  // doc comment). Without this allowance, tapping "Kayıt Ol" on login would
  // get force-replaced back to login on every re-render, since
  // isAtTarget(login, register-segments) is correctly `false` (login and
  // register are distinct screens). Does NOT apply to verify-email: losing
  // auth while there (e.g. after signOut) must still force a real
  // navigation to login.
  const alreadyOnAllowedPublicAuthScreen =
    !state.isAuthenticated && isAtAnyTarget(PUBLIC_AUTH_ROUTES, segments);

  if (isAtTarget(target, segments) || alreadyOnAllowedPublicAuthScreen) return null;

  return target;
}

function toSegments(route: ResolvedRoute): string[] {
  if (route === "/unknown-role") return ["unknown-role"];
  return route.replace(/^\//, "").split("/").filter(Boolean);
}

export interface RouteGuardSimulationResult {
  // Every route actually navigated to, in order, until settled.
  navigations: ResolvedRoute[];
  finalSegments: string[];
  // True only if the redirect budget below was exhausted without settling —
  // i.e. a genuine infinite-loop condition, the exact failure mode
  // router.replace() itself has no protection against in production.
  loopDetected: boolean;
}

// Real screens never chain more than 2-3 redirects deep (e.g. pending ->
// verify-email, or unauthenticated -> login) even in the most convoluted
// state; anything beyond this is a real loop, not a slow-but-fine settle.
const MAX_REDIRECTS_PER_SIMULATION = 10;

// Simulates what actually happens in the running app: RouteGuard's effect
// computes a target, calls router.replace(target), which changes `segments`
// and re-triggers the effect against the NEW segments — repeating until it
// stabilizes (decideRouteGuardTarget returns null) or the redirect budget
// is exhausted. A real infinite loop is reported explicitly here instead of
// hanging forever the way it would in the actual app.
export function simulateRouteGuardNavigation(
  state: RouteGuardAuthState,
  startSegments: string[],
): RouteGuardSimulationResult {
  let segments = startSegments;
  const navigations: ResolvedRoute[] = [];

  for (let i = 0; i < MAX_REDIRECTS_PER_SIMULATION; i++) {
    const target = decideRouteGuardTarget(state, segments);
    if (target === null) {
      return { navigations, finalSegments: segments, loopDetected: false };
    }
    navigations.push(target);
    segments = toSegments(target);
  }

  return { navigations, finalSegments: segments, loopDetected: true };
}
