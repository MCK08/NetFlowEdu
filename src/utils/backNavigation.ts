// Phase 102 — the one rule for leaving a pushed screen.
//
// A screen reached by a push has history: go back to it. A screen reached
// directly — a deep link, a refreshed browser tab, a notification tap on a
// cold app — has no history, and `router.back()` is a silent no-op that
// leaves the user stranded. The fallback is that screen's canonical parent,
// declared by the screen itself, never an unrelated tab.
//
// Pure so the route contract can be unit-tested without a navigator.

export type BackNavigationAction =
  | { kind: "back" }
  | { kind: "replace"; href: string };

export function resolveBackNavigation(canGoBack: boolean, fallbackHref: string): BackNavigationAction {
  return canGoBack ? { kind: "back" } : { kind: "replace", href: fallbackHref };
}
