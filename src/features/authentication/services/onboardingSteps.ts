import { OnboardingStatus } from "@utils/onboardingStatus";

// The two sign-up paths this app actually has. They do NOT share a step
// list: an email/password account must verify its address before Stage 2
// can grant a role, while a Google account arrives already verified by
// Google but is missing the username/role this app needs (see
// GoogleOnboardingScreen). Modelling one generic list for both would mean
// showing at least one step that can never apply.
export type OnboardingFlow = "password" | "google";

export type OnboardingStepId = "account" | "verification" | "profile" | "completion";

export interface OnboardingStep {
  id: OnboardingStepId;
  label: string;
}

const STEP_LABELS: Record<OnboardingStepId, string> = {
  account: "Hesap",
  verification: "Doğrulama",
  profile: "Profil",
  completion: "Hazır",
};

function step(id: OnboardingStepId): OnboardingStep {
  return { id, label: STEP_LABELS[id] };
}

const PASSWORD_STEPS: readonly OnboardingStep[] = [
  step("account"),
  step("verification"),
  step("completion"),
] as const;

const GOOGLE_STEPS: readonly OnboardingStep[] = [
  step("account"),
  step("profile"),
  step("completion"),
] as const;

export function stepsForFlow(flow: OnboardingFlow): readonly OnboardingStep[] {
  return flow === "google" ? GOOGLE_STEPS : PASSWORD_STEPS;
}

// Every field here is real state this app already tracks — nothing is
// inferred, guessed, or persisted just to drive a progress bar.
export interface OnboardingProgressState {
  // A Firebase Auth account exists for this session.
  hasAuthAccount: boolean;
  // Firebase Auth's own emailVerified flag.
  isEmailVerified: boolean;
  // profile.requestedRole !== null — what initializeOnboarding (Stage 1)
  // records. False only for a brand-new Google sign-up.
  hasRequestedRole: boolean;
  // The live users/{uid}.onboardingStatus. "complete" is the only terminal
  // value; see utils/onboardingStatus.ts.
  onboardingStatus: OnboardingStatus | null;
}

// Which step the person is ON right now. Purely derived — this function is
// never the authority for anything, it only decides what to highlight. The
// server's onboardingStatus and the ID token's claims remain the only
// things that actually gate access (see RouteGuard/routing.ts).
export function resolveOnboardingStep(
  flow: OnboardingFlow,
  state: OnboardingProgressState,
): OnboardingStepId {
  if (!state.hasAuthAccount) return "account";

  if (flow === "google") {
    // A Google account's address is already verified by Google, so the only
    // thing standing between it and a usable session is the username/role
    // this app collects itself.
    if (!state.hasRequestedRole) return "profile";
    return state.onboardingStatus === "complete" ? "completion" : "profile";
  }

  if (!state.isEmailVerified) return "verification";
  // Verified but Stage 2 hasn't granted the role yet — still the
  // verification step's own retry button that moves this forward.
  return state.onboardingStatus === "complete" ? "completion" : "verification";
}

export function stepIndex(flow: OnboardingFlow, stepId: OnboardingStepId): number {
  return stepsForFlow(flow).findIndex((candidate) => candidate.id === stepId);
}

// "Adım 2 / 3" — a count of real steps, never a synthesized percentage.
export function stepCounterLabel(flow: OnboardingFlow, stepId: OnboardingStepId): string {
  const steps = stepsForFlow(flow);
  const index = stepIndex(flow, stepId);
  // A step that isn't part of this flow can't be counted; fall back to the
  // step's own name rather than printing a misleading position.
  if (index === -1) return STEP_LABELS[stepId];
  return `Adım ${index + 1} / ${steps.length}`;
}

// What a screen reader should announce for the progress indicator as a
// whole, so the current position isn't conveyed by the filled/unfilled
// styling alone.
export function stepAccessibilityLabel(flow: OnboardingFlow, stepId: OnboardingStepId): string {
  const steps = stepsForFlow(flow);
  const index = stepIndex(flow, stepId);
  if (index === -1) return STEP_LABELS[stepId];
  return `${stepCounterLabel(flow, stepId)}: ${steps[index]?.label ?? STEP_LABELS[stepId]}`;
}

// True once the server says this account is finished. A legacy account —
// created before onboardingStatus existed, which resolveOnboardingStatus
// reports as "complete" — is finished too, and must never be shown
// mid-onboarding chrome.
export function isOnboardingFinished(state: OnboardingProgressState): boolean {
  return state.hasAuthAccount && state.onboardingStatus === "complete";
}
