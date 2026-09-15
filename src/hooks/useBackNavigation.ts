import { Href, router } from "expo-router";
import { useCallback } from "react";

import { resolveBackNavigation } from "@utils/backNavigation";

/**
 * Phase 102 — the shared "leave this pushed screen" action.
 *
 * Back when there is history; otherwise replace with the screen's declared
 * parent (see utils/backNavigation.ts). AppBackButton renders this; screens
 * that must do something first (confirm discarding a drawing, end a study
 * session) call it themselves at the right moment.
 */
export function useBackNavigation(fallbackHref: Href): () => void {
  return useCallback(() => {
    const action = resolveBackNavigation(router.canGoBack(), String(fallbackHref));
    if (action.kind === "back") router.back();
    else router.replace(fallbackHref);
  }, [fallbackHref]);
}
