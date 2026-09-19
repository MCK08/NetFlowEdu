// Phase 113 — deletes the vestigial points fields from existing users.
//
// WHY THIS EXISTS
//
// totalPoints/weeklyPoints were created by onUserCreate and then never
// touched again: no Cloud Function, no client, no trigger ever awarded a
// point, so every account has carried 0 since the day it was made. Phase
// 113 removed the system; this removes what it left behind in the data.
//
// Code changes are not retroactive — every existing users/{uid} still has
// both fields. Unlike publicProfiles (replaced wholesale on the next
// sync), nothing rewrites a user document in full, so without this script
// the fields would sit there indefinitely.
//
// WHAT IT TOUCHES
//
// Only the users collection, and within each document only the two fields
// below, via FieldValue.delete(). Every other field — email, role,
// organizationId, accountStatus, onboardingStatus, displayName, photoURL,
// createdAt — is left exactly as it is: not read, not rewritten, not
// reordered. It creates nothing and deletes no document.
//
// ORDER MATTERS. firestore.rules must be deployed BEFORE this runs. The
// old rule compared `request.resource.data.totalPoints ==
// resource.data.totalPoints`, and that comparison THROWS on a document
// without the key, denying the whole update — so a cleaned profile would
// be unable to edit its own displayName until the tolerant rule is live.
//
// PRIVACY
//
// Logs counts and document ids only — never a field value, an email or a
// display name.
//
// IDEMPOTENCY
//
// Deleting an absent field is a no-op and documents carrying neither field
// are skipped, so a second run reports 0 changed and writes nothing.
//
// SAFETY
//
// Dry run by default. Writing needs --apply; leaving the emulator needs
// --allow-production as well.
//
//   node functions/scripts/cleanupVestigialPoints.mts                  (dry run)
//   node functions/scripts/cleanupVestigialPoints.mts --apply          (emulator)
//   node functions/scripts/cleanupVestigialPoints.mts --apply --allow-production

import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

/** The whole of the removed system, as stored. Nothing else is in scope. */
export const VESTIGIAL_POINT_FIELDS = ["totalPoints", "weeklyPoints"] as const;

const BATCH_LIMIT = 400;
const PAGE_SIZE = 500;

const apply = process.argv.includes("--apply");
const allowProduction = process.argv.includes("--allow-production");

function assertTargetAllowed(): void {
  if (process.env.FIRESTORE_EMULATOR_HOST) return;
  if (allowProduction) {
    console.warn("[cleanupVestigialPoints] FIRESTORE_EMULATOR_HOST is not set — targeting REAL Firestore.");
    return;
  }
  console.error(
    "[cleanupVestigialPoints] REFUSING TO RUN: no FIRESTORE_EMULATOR_HOST set.\n" +
      "This would target real Firestore. Re-run with --allow-production if that is genuinely intended,\n" +
      "or export FIRESTORE_EMULATOR_HOST (e.g. 127.0.0.1:8080) to run it against the emulator.\n" +
      "Deploy firestore.rules FIRST — see the header of this file for why the order matters.",
  );
  process.exit(1);
}

/** The vestigial fields this document actually carries. Empty means skip. */
function vestigialFieldsPresent(data: Record<string, unknown>): string[] {
  return VESTIGIAL_POINT_FIELDS.filter((field) => data[field] !== undefined);
}

async function cleanupVestigialPoints(): Promise<{ scanned: number; changed: number }> {
  const db = getFirestore();
  let scanned = 0;
  let changed = 0;
  let pending = 0;
  let batch = db.batch();
  // Paginated by document id so a large user collection is never held in
  // memory at once, and so the walk is resumable/deterministic.
  let cursor: string | null = null;

  for (;;) {
    let page = db.collection("users").orderBy("__name__").limit(PAGE_SIZE);
    if (cursor) page = page.startAfter(cursor);
    const snapshot = await page.get();
    if (snapshot.empty) break;

    for (const document of snapshot.docs) {
      scanned += 1;
      const stale = vestigialFieldsPresent(document.data() as Record<string, unknown>);
      if (stale.length === 0) continue;

      changed += 1;
      console.log(`[cleanupVestigialPoints] ${apply ? "deleting" : "would delete"} ${stale.join(", ")} — users/${document.id}`);
      if (!apply) continue;

      batch.update(document.ref, Object.fromEntries(stale.map((field) => [field, FieldValue.delete()])));
      pending += 1;
      if (pending === BATCH_LIMIT) {
        await batch.commit();
        batch = db.batch();
        pending = 0;
      }
    }

    cursor = snapshot.docs[snapshot.docs.length - 1]?.id ?? null;
    if (snapshot.size < PAGE_SIZE) break;
  }

  if (apply && pending > 0) await batch.commit();
  return { scanned, changed };
}

assertTargetAllowed();
initializeApp();

const { scanned, changed } = await cleanupVestigialPoints();
console.log(`[cleanupVestigialPoints] scanned ${scanned} user(s); ${changed} ${apply ? "cleaned" : "would be cleaned"}.`);
if (!apply) console.log("[cleanupVestigialPoints] DRY RUN — nothing written. Re-run with --apply to write.");
console.log("VESTIGIAL POINTS CLEANUP DONE");
