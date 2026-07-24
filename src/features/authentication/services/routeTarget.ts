import { ROUTES } from "@constants/routes";

import { ResolvedRoute } from "./routing";

// Whether the current segments already satisfy `target`, so RouteGuard only
// ever calls router.replace() when it's actually needed (settled states
// never loop). Mirrors resolveRouteForState's own granularity: verify-email
// and unknown-role are exact screens, everything else is a route-group
// root that may have sub-screens beneath it (e.g. "(student)/(tabs)/profile"
// still counts as being at ROUTES.student).
//
// Pure/no React dependency on purpose — kept in its own file (like
// routing.ts) so it's directly unit-testable without pulling in RouteGuard's
// JSX, which this test setup doesn't transform.
export function isAtTarget(target: ResolvedRoute, segments: string[]): boolean {
  if (target === ROUTES.verifyEmail) return "/" + segments.join("/") === ROUTES.verifyEmail;
  if (target === "/unknown-role") return segments[0] === "unknown-role";
  // Every other ROUTES value is "/(group)/..." — a leading slash before the
  // parenthesized group, not the group at position 0.
  const targetGroup = target.match(/^\/(\([^/]+\))/)?.[1];
  return segments[0] === targetGroup;
}
