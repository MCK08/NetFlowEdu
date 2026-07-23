import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { getFirestore } from "firebase-admin/firestore";

// Keeps publicProfiles/{uid} (safe fields any authenticated user may read —
// see firestore.rules) in sync with users/{uid} (owner-only, contains
// email/accountStatus). Fires on every users/{uid} write, so it's
// idempotent by construction: re-running it with the same source data
// always produces the same public copy, no dedup/marker needed.
//
// Suspension handling: a suspended account's public profile is deleted
// outright rather than kept-but-sanitized — a suspended user shouldn't
// still show up in another user's "who liked/commented this" surfaces at
// all, and deleting is simpler than maintaining a second "is this visible"
// branch throughout every reader of publicProfiles.
export const syncPublicProfile = onDocumentWritten("users/{uid}", async (event) => {
  const uid = event.params.uid;
  const after = event.data?.after;
  const db = getFirestore();
  const publicRef = db.collection("publicProfiles").doc(uid);

  if (!after?.exists) {
    // users/{uid} was deleted — no account left to have a public profile.
    await publicRef.delete().catch(() => undefined);
    return;
  }

  const data = after.data();
  if (!data) return;

  if (data.accountStatus === "suspended") {
    await publicRef.delete().catch(() => undefined);
    logger.info(`Deleted publicProfiles/${uid} — account suspended`, { uid });
    return;
  }

  // Only ever these fields — never email, accountStatus, or any
  // moderation-only data, no matter what gets added to users/{uid} later.
  await publicRef.set({
    uid,
    username: data.username ?? null,
    displayName: data.displayName ?? "",
    photoURL: data.photoURL ?? null,
    role: data.role ?? "student",
    organizationId: data.organizationId ?? null,
    totalPoints: data.totalPoints ?? 0,
    weeklyPoints: data.weeklyPoints ?? 0,
    createdAt: data.createdAt ?? null,
  });
});
