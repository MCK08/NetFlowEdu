import * as functionsV1 from "firebase-functions/v1";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";

// Cloud Functions 2nd Gen has no direct non-blocking "user created" event —
// its only identity hooks are the blocking beforeUserCreated /
// beforeUserSignedIn functions, meant for short-lived veto/mutation logic
// right at sign-up, not for writing a Firestore document. The 1st-gen Auth
// trigger (functions.auth.user().onCreate) is still the documented, fully
// supported way to react to user creation, and it coexists in the same
// codebase as the 2nd-gen HTTPS/callable functions used elsewhere in this
// project — this file is the one intentional v1 exception.
//
// Idempotency: Cloud Functions may retry a trigger invocation on failure.
// We only ever create the profile if it doesn't already exist, so a retry
// (or, in principle, a second invocation for the same uid) can never
// overwrite a role/points an admin has since promoted.
export const onUserCreate = functionsV1.auth.user().onCreate(async (user) => {
  const db = getFirestore();
  const userRef = db.collection("users").doc(user.uid);

  const existing = await userRef.get();
  if (existing.exists) {
    logger.info(`users/${user.uid} already exists, skipping profile creation`, {
      uid: user.uid,
    });
    return;
  }

  const now = FieldValue.serverTimestamp();

  await userRef.create({
    uid: user.uid,
    email: (user.email ?? "").trim().toLowerCase(),
    displayName: user.displayName ?? "",
    role: "student",
    organizationId: null,
    photoURL: user.photoURL ?? null,
    totalPoints: 0,
    weeklyPoints: 0,
    accountStatus: "active",
    emailVerified: user.emailVerified,
    createdAt: now,
    updatedAt: now,
  });

  await getAuth().setCustomUserClaims(user.uid, {
    role: "student",
    organizationId: null,
  });

  logger.info(`Created student profile for users/${user.uid}`, { uid: user.uid });
});
