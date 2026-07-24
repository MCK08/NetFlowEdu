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
// Non-fatal by design: a failure at any point is swallowed. There's no
// risk of a refresh/onboarding loop from that — this function is only ever
// invoked by explicit user action (the verify-email screen's button) or
// once at sign-in, never on a timer or automatic retry loop. A failed
// attempt just means the next explicit trigger (another tap, another
// login) retries — safe because completeOnboarding is itself idempotent
// (see functions/src/onboarding/completeOnboarding.ts).
//
// Deliberately does NOT touch users/{uid}.role for any authorization
// decision — it only refreshes the ID token so firestore.rules' claims
// checks (the actual backend authorization boundary) see the new values.
// Firestore profile state and routing are handled elsewhere: the live
// users/{uid} onSnapshot subscription (AuthProvider) and RouteGuard react
// to the change on their own once it lands.
export async function verifyAndCompleteOnboarding(user: User): Promise<void> {
  await reloadCurrentUser(user);
  await refreshIdToken(user);

  if (!user.emailVerified) return;

  try {
    await completeOnboarding();
    await refreshIdToken(user);
  } catch {
    // Non-fatal — see doc comment above.
  }
}
