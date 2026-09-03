import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { useAuth } from "@features/authentication";

import {
  EMPTY_GUIDED_TOUR_RECORD,
  GuidedTourAudience,
  GuidedTourPresentation,
  GuidedTourRecord,
  isLastGuidedTourStep,
  nextGuidedTourStep,
  resolveGuidedTourAudience,
  resolveGuidedTourPresentation,
  withGuidedTourCompleted,
  withGuidedTourReset,
} from "../services/guidedTour";
import {
  clearGuidedTourCompletion,
  loadGuidedTourRecord,
  saveGuidedTourCompleted,
} from "../services/guidedTourStorage";

export interface GuidedTourContextValue {
  presentation: GuidedTourPresentation;
  stepIndex: number;
  isLastStep: boolean;
  advance: () => void;
  dismiss: () => void;
  /** Only meaningful for the signed-in account's own audience. Null when the
   *  current role has no authored tour (the two admin roles). */
  replayAudience: GuidedTourAudience | null;
  replay: () => void;
}

const GuidedTourContext = createContext<GuidedTourContextValue | null>(null);

// Phase 74 — one piece of state read by two places that are nowhere near each
// other in the tree: the overlay, mounted at the root above the navigator, and
// the "Tanıtımı Tekrar Gör" row inside Profile. A context is what lets Profile
// reopen the tour without either screen knowing the other exists, and it is
// the same shape ThemeProvider and AuthProvider already use.
export function useGuidedTourState(): GuidedTourContextValue {
  const { isAuthenticated, isEmailVerified, role, profile, firebaseUser } = useAuth();

  const [record, setRecord] = useState<GuidedTourRecord | null>(null);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadGuidedTourRecord().then((loaded) => {
      if (!cancelled) setRecord(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The profile is the authority on identity here, not firebaseUser: the gate
  // also reads onboardingStatus and role off the same document, and mixing a
  // uid from one source with a role from another is how an account switch ends
  // up recording the previous account's completion.
  const userId = profile?.uid ?? firebaseUser?.uid ?? null;
  const audience = resolveGuidedTourAudience(role);

  const presentation = useMemo(
    () =>
      resolveGuidedTourPresentation({
        recordLoaded: record !== null,
        record,
        isAuthenticated,
        isEmailVerified,
        accountOnboardingStatus: profile?.onboardingStatus ?? null,
        role,
        userId,
      }),
    [record, isAuthenticated, isEmailVerified, profile?.onboardingStatus, role, userId],
  );

  // A newly-visible tour always starts at its first card. Without this, an
  // account switch would drop the next account straight onto step 3.
  const visibleAudience = presentation.kind === "visible" ? presentation.audience : null;
  useEffect(() => {
    setStepIndex(0);
  }, [visibleAudience, userId]);

  const commit = useCallback(() => {
    if (presentation.kind !== "visible" || !userId) return;
    const finished = presentation.audience;
    // Optimistic, and deliberately before the await: the overlay must close on
    // the tap, not when AsyncStorage gets around to it. The write below is
    // what makes it stay closed next launch; if it fails the tour reappears,
    // which is the harmless direction.
    setRecord((current) =>
      withGuidedTourCompleted(current ?? EMPTY_GUIDED_TOUR_RECORD, userId, finished),
    );
    void saveGuidedTourCompleted(userId, finished);
  }, [presentation, userId]);

  const advance = useCallback(() => {
    if (presentation.kind !== "visible") return;
    const count = presentation.steps.length;
    if (isLastGuidedTourStep(stepIndex, count)) {
      commit();
      return;
    }
    setStepIndex((current) => nextGuidedTourStep(current, count));
  }, [presentation, stepIndex, commit]);

  // Skip and finish record the same thing — see saveGuidedTourCompleted.
  const dismiss = commit;

  const replay = useCallback(() => {
    if (!userId || audience === null) return;
    setStepIndex(0);
    setRecord((current) =>
      withGuidedTourReset(current ?? EMPTY_GUIDED_TOUR_RECORD, userId, audience),
    );
    void clearGuidedTourCompletion(userId, audience);
  }, [userId, audience]);

  const isLastStep =
    presentation.kind === "visible"
      ? isLastGuidedTourStep(stepIndex, presentation.steps.length)
      : false;

  return useMemo(
    () => ({
      presentation,
      stepIndex,
      isLastStep,
      advance,
      dismiss,
      replayAudience: audience,
      replay,
    }),
    [presentation, stepIndex, isLastStep, advance, dismiss, audience, replay],
  );
}

export const GuidedTourProvider = GuidedTourContext.Provider;

export function useGuidedTour(): GuidedTourContextValue | null {
  return useContext(GuidedTourContext);
}
