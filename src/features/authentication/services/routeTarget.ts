import { ROUTES } from "@constants/routes";

import { ResolvedRoute } from "./routing";

// The (auth) group holds several DISTINCT, non-interchangeable screens
// (login, register, forgot-password, verify-email) — unlike
// (student)/(teacher)/(admin), where every screen inside the group is a
// legitimate stand-in for "arrived" (e.g. "(student)/(tabs)/profile" counts
// as being at ROUTES.student). Any ResolvedRoute in this list requires an
// exact path match, not just "same top-level group". Listed here once, in
// one place, rather than as scattered ad hoc `target === ROUTES.x` checks —
// adding a future (auth) screen just means adding it to this list.
//
// Production bug history:
//  - Originally login fell through to the generic group-match branch below,
//    so isAtTarget(ROUTES.login, ["(auth)","verify-email"]) was `true` —
//    RouteGuard believed a signed-out user sitting on verify-email was
//    "already at" login and never actually navigated them away.
//  - Fixing that by exact-matching ONLY login (and verify-email) then broke
//    register/forgot-password: isAtTarget(ROUTES.login, ["(auth)","register"])
//    became `false`, so RouteGuard force-replaced back to login on every
//    render while an unauthenticated user was on the register screen — the
//    "Kayıt Ol button does nothing" regression. RouteGuard's separate
//    PUBLIC_AUTH_ROUTES allowance (see below) is what actually keeps
//    register/forgot-password navigable for an unauthenticated user; this
//    list's job is only to make isAtTarget itself correct and symmetric for
//    every (auth) screen, independent of that.
const EXACT_MATCH_AUTH_ROUTES: ResolvedRoute[] = [
  ROUTES.login,
  ROUTES.register,
  ROUTES.forgotPassword,
  ROUTES.verifyEmail,
];

// Whether the current segments already satisfy `target`, so RouteGuard only
// ever calls router.replace() when it's actually needed (settled states
// never loop). Mirrors resolveRouteForState's own granularity: the (auth)
// group's screens and unknown-role are exact screens, everything else is a
// route-group root that may have sub-screens beneath it.
//
// Pure/no React dependency on purpose — kept in its own file (like
// routing.ts) so it's directly unit-testable without pulling in RouteGuard's
// JSX, which this test setup doesn't transform.
export function isAtTarget(target: ResolvedRoute, segments: string[]): boolean {
  if (EXACT_MATCH_AUTH_ROUTES.includes(target)) {
    return "/" + segments.join("/") === target;
  }
  if (target === "/unknown-role") return segments[0] === "unknown-role";
  // Every other ROUTES value is "/(group)/..." — a leading slash before the
  // parenthesized group, not the group at position 0.
  const targetGroup = target.match(/^\/(\([^/]+\))/)?.[1];
  return segments[0] === targetGroup;
}

// Whether the current segments exactly match ANY of the given targets —
// used by RouteGuard's PUBLIC_AUTH_ROUTES allowance below.
export function isAtAnyTarget(targets: ResolvedRoute[], segments: string[]): boolean {
  return targets.some((target) => isAtTarget(target, segments));
}

// Screens reachable and valid WITHOUT an authenticated session — a user
// navigating between these (e.g. tapping "Kayıt Ol" on login, or "Şifremi
// unuttum") must not be yanked back to the canonical login target on every
// RouteGuard re-render just because resolveRouteForState always resolves
// "unauthenticated" to the single literal ROUTES.login. verify-email is
// deliberately excluded: it requires an authenticated-but-unverified
// session, so if auth is lost while sitting there (e.g. after signOut), the
// user MUST be moved to the literal login screen, not left in place.
export const PUBLIC_AUTH_ROUTES: ResolvedRoute[] = [
  ROUTES.login,
  ROUTES.register,
  ROUTES.forgotPassword,
];
