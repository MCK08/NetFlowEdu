import { User } from "firebase/auth";

import { reloadCurrentUser, refreshIdToken } from "@services/firebase/auth";
import { completeOnboarding } from "@services/firebase/functions";

// The single authoritative implementation of the Stage-2-onboarding refresh
// sequence — used by both AuthProvider.refreshSession (the in-app "check
// verification again" button) and AuthProvider.signIn (covers verifying via
// the email link outside the app, then logging in fresh). Extracted here,
// rather than duplicated inline in each, specifically so the exact order can
// be unit-tested — see tests/unit/onboardingSession.test.ts.
//
// Required order (audited):
//   1. reload(user)              — picks up a just-verified email server-side
//   2. getIdToken(true)          — refreshes the ID token's own
//                                   email_verified claim BEFORE calling
//                                   completeOnboarding, since reload() alone
//                                   updates the local User object but not
//                                   the cached JWT the callable actually
//                                   receives as request.auth.token
//   3. completeOnboarding()      — the only place role/organizationId/
//                                   custom claims are ever granted (server
//                                   re-verifies email_verified itself; the
//                                   client-observed flag here only decides
//                                   whether to bother calling at all)
//   4. getIdToken(true) again    — AFTER completeOnboarding succeeds, so a
//                                   just-promoted teacher's very next call
//                                   (e.g. createClass) already carries the
//                                   new role/organizationId claims, with no
//                                   logout/login or reinstall required
//
// A completeOnboarding failure never throws out of this function — sign-in
// must never be blocked by an onboarding hiccup, and this same function is
// also called from signIn(). But it is NOT silently discarded either: the
// boolean return value tells the caller whether Stage 2 actually finished,
// so a caller that specifically exists to drive onboarding completion
// (AuthProvider.refreshSession, in turn the verify-email screen's button)
// can tell the difference between "done" and "still stuck" and let the
// user retry — instead of navigating away as if it had succeeded. Before
// this, a failed call here (e.g. a transient network/claims-propagation
// error right after verifying) left onboardingStatus stuck at "pending"
// forever with zero visibility and zero retry, which is exactly the
// "teacher shows as student forever" production bug this fixes.
//
// Retry-safe to call repeatedly regardless of outcome — completeOnboarding
// is itself idempotent (see functions/src/onboarding/completeOnboarding.ts),
// so returning false here is always safe to retry, never double-acts.
//
// Deliberately does NOT touch users/{uid}.role for any authorization
// decision — it only refreshes the ID token so firestore.rules' claims
// checks (the actual backend authorization boundary) see the new values.
// Firestore profile state and routing are handled elsewhere: the live
// users/{uid} onSnapshot subscription (AuthProvider) and RouteGuard react
// to the change on their own once it lands — RouteGuard specifically also
// checks onboardingStatus (see routing.ts), so a caller that returned
// false here is kept on the retry screen rather than routed away.
export async function verifyAndCompleteOnboarding(user: User): Promise<boolean> {
  await reloadCurrentUser(user);
  await refreshIdToken(user);

  if (!user.emailVerified) return false;

  try {
    await completeOnboarding();
    await refreshIdToken(user);
    return true;
  } catch {
    return false;
  }
}
