import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import { resolveOnboardingStatus } from "./onboardingStatus";

interface InitializeOnboardingRequest {
  requestedRole: "student" | "teacher";
  displayName: string;
}

interface InitializeOnboardingResult {
  onboardingStatus: "pending" | "complete";
  requestedRole: "student" | "teacher" | null;
}

const MAX_DISPLAY_NAME_LENGTH = 60;

// Stage 1 of onboarding — called immediately after Firebase Auth account
// creation, BEFORE email verification. Persists exactly two things:
// displayName (deterministically, from the exact value the registration
// form collected — never read back off the Auth user object, which is what
// fixes the name-race bug) and requestedRole (a record of what the user
// picked, not yet acted on).
//
// Deliberately does NOT touch role/organizationId/custom claims — granting
// real privileges is Stage 2's (completeOnboarding) job alone, and that
// stage refuses to run until the caller's email is verified. Splitting the
// two stages this way makes "an unverified account holds usable teacher
// claims" structurally impossible, not just unlikely: there is no code path
// in this file that can ever set a claim.
export const initializeOnboarding = onCall<InitializeOnboardingRequest>(
  { region: "us-central1" },
  async (request): Promise<InitializeOnboardingResult> => {
    const caller = request.auth;
    if (!caller) {
      throw new HttpsError("unauthenticated", "Bu işlem için giriş yapmanız gerekiyor.");
    }

    const requestedRole = request.data?.requestedRole;
    if (requestedRole !== "student" && requestedRole !== "teacher") {
      throw new HttpsError("invalid-argument", "Geçersiz hesap türü.");
    }

    const rawDisplayName = request.data?.displayName;
    if (typeof rawDisplayName !== "string" || rawDisplayName.trim().length === 0) {
      throw new HttpsError("invalid-argument", "Ad Soyad gerekli.");
    }
    const displayName = rawDisplayName.trim().slice(0, MAX_DISPLAY_NAME_LENGTH);

    const db = getFirestore();
    const userRef = db.collection("users").doc(caller.uid);
    const snap = await userRef.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "Kullanıcı bulunamadı.");
    }

    const data = snap.data() ?? {};
    const status = resolveOnboardingStatus(data.onboardingStatus);

    // Not pending — either a legacy account (never had the field) or one
    // that's already moved past this stage. No-op either way: this stage
    // never mutates a non-"pending" account, so it can never be used to
    // change an already-decided requestedRole or resurrect a completed one.
    if (status !== "pending") {
      return {
        onboardingStatus: status === "provisioning" ? "pending" : "complete",
        requestedRole: (data.requestedRole as "student" | "teacher" | undefined) ?? null,
      };
    }

    // requestedRole is settable exactly once: if a prior call already
    // stored one, this call (even with a different role in its own
    // request) can never overwrite it — only displayName can still be
    // refreshed (e.g. a retried call after a flaky network response).
    const existingRequestedRole = data.requestedRole as "student" | "teacher" | undefined;
    const finalRequestedRole = existingRequestedRole ?? requestedRole;

    await userRef.update({
      displayName,
      requestedRole: finalRequestedRole,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { onboardingStatus: "pending", requestedRole: finalRequestedRole };
  },
);
