import {
  isOnboardingFinished,
  OnboardingFlow,
  OnboardingStepId,
  resolveOnboardingStep,
} from "../services/onboardingSteps";
import { useAuth } from "./useAuth";

// Wires the pure step model to the app's REAL auth/profile state. Screens
// deliberately do not pass a hardcoded step: hardcoding would make the
// indicator a decoration that could silently disagree with where the
// account actually is.
//
// Returns null once the server reports the account finished — including a
// legacy account, whose absent onboardingStatus resolves to "complete". A
// finished account must never be shown onboarding chrome, and returning
// null is what stops the indicator from rendering at all.
export function useOnboardingProgress(flow: OnboardingFlow): OnboardingStepId | null {
  const { isAuthenticated, isEmailVerified, profile } = useAuth();

  const state = {
    hasAuthAccount: isAuthenticated,
    isEmailVerified,
    // A profile that hasn't loaded yet is treated as "no role requested" —
    // this only affects which step is highlighted, never any routing or
    // authorization decision (that is RouteGuard's, from its own state).
    hasRequestedRole: profile ? profile.requestedRole !== null : false,
    onboardingStatus: profile?.onboardingStatus ?? null,
  };

  if (isOnboardingFinished(state)) return null;
  return resolveOnboardingStep(flow, state);
}
