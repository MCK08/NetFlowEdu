// Phase 108 — "Çalışma Planım"'s routes, owned by the feature (the same
// reasoning ANALYTICS_ROUTES documents: none of these is an auth landing
// target, so none belongs in ROUTES / ResolvedRoute).
//
// Call sites cast with `as never`, the pattern every router.push in the app
// uses: expo-router's typed-route union is generated into a gitignored cache
// and does not know a route until the dev server next regenerates it.
export const PLAN_ROUTES = {
  home: "/(student)/plan",
  step: "/(student)/plan/step",
  week: "/(student)/plan/week",
  settings: "/(student)/plan/settings",
  gaps: "/(student)/plan/gaps",
  strengths: "/(student)/plan/strengths",
  progress: "/(student)/plan/progress",
  community: "/(student)/plan/community",
} as const;

export function planStepRoute(stepId: string): string {
  return `${PLAN_ROUTES.step}?stepId=${encodeURIComponent(stepId)}`;
}
