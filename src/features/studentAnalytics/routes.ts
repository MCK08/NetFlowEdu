// Phase 107 — Kişisel Analiz's routes, owned by the feature.
//
// Deliberately NOT in @constants/routes' ROUTES. That object's values form
// ResolvedRoute — the set RouteGuard may redirect an auth state to — and none
// of these screens is ever an auth landing target. Growing that union would
// widen what the guard is allowed to resolve to without any reason to.
//
// Call sites cast with `as never`, the same pattern every existing
// router.push in the app uses: expo-router's typed-route union is generated
// from app/ by the dev server into a gitignored cache, so a newly added
// route is unknown to the type checker until that cache next regenerates.
export const ANALYTICS_ROUTES = {
  overview: "/(student)/analytics",
  subjects: "/(student)/analytics/subjects",
  topic: "/(student)/analytics/topic",
  questionTypes: "/(student)/analytics/question-types",
  // "Çözemediğim Sorular" — the question-evidence archive.
  archive: "/(student)/analytics/archive",
} as const;

export function archivedQuestionRoute(questionId: string): string {
  return `${ANALYTICS_ROUTES.archive}/${encodeURIComponent(questionId)}`;
}

/** The canonical question-solving screen — "Tekrar Çöz" routes here and
 *  nowhere else, so no second renderer or evaluation path can exist. */
export function questionSolvingRoute(questionId: string): string {
  return `/(student)/question/${encodeURIComponent(questionId)}`;
}
