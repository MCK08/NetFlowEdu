import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import { buildOrganizationName } from "./organizationName";
import { resolveOnboardingStatus } from "./onboardingStatus";

interface CompleteOnboardingResult {
  role: "student" | "teacher";
  organizationId: string | null;
  onboardingStatus: "complete";
}

// Stage 2 of onboarding — the ONLY path a role/organization/custom claim is
// ever actually granted through. Takes NO role input from the client at
// all: it exclusively reads the requestedRole Stage 1 (initializeOnboarding)
// already stored server-side, so a client can never smuggle a different
// role in here even if it wanted to.
//
// Gated on `request.auth.token.email_verified == true` — an unverified
// caller gets `failed-precondition` and nothing about their account
// changes. This is a real Cloud Functions authorization check, not a
// client-side screen hiding a button: even a hand-crafted callable request
// from a verified-looking but actually-unverified session is rejected
// server-side.
//
// State machine (users/{uid}.onboardingStatus):
//   pending      -> set by onUserCreate for every new account. Eligible to
//                    run the full completion path below.
//   provisioning -> set inside the SAME Firestore transaction that decides
//                    role/organizationId (and creates the organization for
//                    a teacher) — i.e. by the time this state is visible at
//                    all, that decision is already durably committed and
//                    will never change on a retry.
//   complete     -> claims have been confirmed to match Firestore (set or
//                    already-matching) and the flag itself is set.
//   (missing)    -> legacy account (predates this field) OR — after
//                    resolveOnboardingStatus — treated identically to
//                    "complete". Never re-enters the pending path.
//
// Retry-safety: Firestore and Auth custom claims are two separate systems
// with no shared transaction, so a crash between "Firestore says teacher"
// and "claims say teacher" is possible in principle. Every call — pending,
// provisioning, or complete — ends by reconciling actual Auth claims
// against Firestore's stored role/organizationId and repairing the claims
// (merged, never replacing unrelated claims) if they don't match, before
// (re)confirming onboardingStatus == "complete". This is what makes a
// retry, from ANY point of failure, converge to a consistent state instead
// of getting stuck or double-acting.
export const completeOnboarding = onCall(
  { region: "us-central1" },
  async (request): Promise<CompleteOnboardingResult> => {
    const caller = request.auth;
    if (!caller) {
      throw new HttpsError("unauthenticated", "Bu işlem için giriş yapmanız gerekiyor.");
    }
    if (caller.token.email_verified !== true) {
      throw new HttpsError(
        "failed-precondition",
        "Devam etmeden önce e-posta adresinizi doğrulamanız gerekiyor.",
      );
    }

    const db = getFirestore();
    const userRef = db.collection("users").doc(caller.uid);
    // Deterministic, uid-derived — the SAME id on every call, for this uid,
    // forever. This alone is what guarantees "never generate a new
    // organizationId on retry" and "organization creation must not
    // duplicate": there is only ever one possible document this could be.
    const orgRef = db.collection("organizations").doc(caller.uid);

    const snap = await userRef.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "Kullanıcı bulunamadı.");
    }
    const data = snap.data() ?? {};
    const status = resolveOnboardingStatus(data.onboardingStatus);

    if (status === "pending") {
      const requestedRole = data.requestedRole;
      if (requestedRole !== "student" && requestedRole !== "teacher") {
        throw new HttpsError(
          "failed-precondition",
          "Hesap türü seçilmemiş. Lütfen kayıt işlemini tamamlayın.",
        );
      }
      const displayName =
        typeof data.displayName === "string" && data.displayName.trim().length > 0
          ? data.displayName
          : "Öğretmen";

      await db.runTransaction(async (tx) => {
        const freshSnap = await tx.get(userRef);
        const freshStatus = resolveOnboardingStatus(freshSnap.data()?.onboardingStatus);
        // Someone else (a concurrent call) already advanced this account
        // past "pending" — don't redo the decision, just fall through to
        // reconciliation below with whatever the winner committed.
        if (freshStatus !== "pending") return;

        if (requestedRole === "teacher") {
          const orgSnap = await tx.get(orgRef);
          if (!orgSnap.exists) {
            tx.set(orgRef, {
              name: buildOrganizationName(displayName),
              ownerId: caller.uid,
              status: "active",
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
          tx.update(userRef, {
            role: "teacher",
            organizationId: orgRef.id,
            accountStatus: "active",
            onboardingStatus: "provisioning",
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else {
          tx.update(userRef, {
            onboardingStatus: "provisioning",
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      });
    }

    // Reached for "provisioning" (either just set above, or left over from
    // an earlier call that got this far and then failed before claims/the
    // final "complete" flip) and for "complete" (a pure reconciliation
    // pass — repairs claims if something external ever desynced them,
    // otherwise a no-op). Re-read: the transaction above (if it ran) is the
    // authoritative source now, not the snapshot from the top of this call.
    const freshSnap = await userRef.get();
    const freshData = freshSnap.data() ?? {};
    return reconcileClaimsAndComplete(caller.uid, freshData);
  },
);

async function reconcileClaimsAndComplete(
  uid: string,
  userData: FirebaseFirestore.DocumentData,
): Promise<CompleteOnboardingResult> {
  const role: "student" | "teacher" = userData.role === "teacher" ? "teacher" : "student";
  const organizationId: string | null = userData.organizationId ?? null;

  const authUser = await getAuth().getUser(uid);
  const currentClaims = authUser.customClaims ?? {};
  const claimsMatch =
    currentClaims.role === role && (currentClaims.organizationId ?? null) === organizationId;

  if (!claimsMatch) {
    // Spread the EXISTING claims first — this is a full replace at the API
    // level (setCustomUserClaims has no partial-merge mode), so any other
    // legitimate claim already on the token has to be explicitly carried
    // forward here or it would be silently erased.
    await getAuth().setCustomUserClaims(uid, {
      ...currentClaims,
      role,
      organizationId,
    });
  }

  await getFirestore().collection("users").doc(uid).update({
    onboardingStatus: "complete",
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { role, organizationId, onboardingStatus: "complete" };
}
