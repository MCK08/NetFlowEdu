// Phase 112 — deletes the legacy fields from existing publicProfiles.
//
// WHY THIS EXISTS
//
// Narrowing the projection (functions/src/profiles/publicProfileProjection.ts)
// only changes what is WRITTEN. syncPublicProfile replaces the document
// rather than merging, so any account whose users/{uid} is touched again
// loses the old fields by itself — but an account that is never written
// again keeps totalPoints/weeklyPoints/organizationId/createdAt sitting in
// a document every authenticated user can read. This script closes that
// gap, and nothing else.
//
// WHAT IT TOUCHES
//
// Only publicProfiles, and within each document only the fields listed in
// LEGACY_PUBLIC_PROFILE_FIELDS — via FieldValue.delete(), so no other
// field is read, rewritten or reordered. It never creates a document,
// never deletes one, and never touches users/{uid} (the private progress
// those numbers belong to stays exactly where it is).
//
// IDEMPOTENCY
//
// Deleting an absent field is a no-op, and the script skips documents that
// carry none of the legacy fields, so a second run reports 0 changed and
// writes nothing.
//
// SAFETY
//
// Dry run by default: it reports what it WOULD delete and exits. Writing
// requires --apply, and targeting anything other than an emulator requires
// --allow-production as well, so a production cleanup is always two
// deliberate flags rather than one forgotten env var.
//
//   node functions/scripts/cleanupPublicProfileFields.mts                 (dry run)
//   node functions/scripts/cleanupPublicProfileFields.mts --apply         (emulator)
//   node functions/scripts/cleanupPublicProfileFields.mts --apply --allow-production

import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import { LEGACY_PUBLIC_PROFILE_FIELDS } from "../src/profiles/publicProfileProjection.ts";

const BATCH_LIMIT = 400;

const apply = process.argv.includes("--apply");
const allowProduction = process.argv.includes("--allow-production");
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

function assertTargetAllowed(): void {
  if (emulatorHost) return;
  if (allowProduction) {
    console.warn(
      "[cleanupPublicProfileFields] FIRESTORE_EMULATOR_HOST is not set — targeting REAL Firestore.",
    );
    return;
  }
  console.error(
    "[cleanupPublicProfileFields] REFUSING TO RUN: no FIRESTORE_EMULATOR_HOST set.\n" +
      "This would target real Firestore. Re-run with --allow-production if that is genuinely intended,\n" +
      "or export FIRESTORE_EMULATOR_HOST (e.g. 127.0.0.1:8080) to run it against the emulator.",
  );
  process.exit(1);
}

/** The legacy fields this document actually carries. Empty means nothing to do. */
function legacyFieldsPresent(data: Record<string, unknown>): string[] {
  return LEGACY_PUBLIC_PROFILE_FIELDS.filter((field) => data[field] !== undefined);
}

async function cleanupPublicProfileFields(): Promise<{ scanned: number; changed: number }> {
  const db = getFirestore();
  const snapshot = await db.collection("publicProfiles").get();

  let changed = 0;
  let batch = db.batch();
  let pending = 0;

  for (const document of snapshot.docs) {
    const stale = legacyFieldsPresent(document.data() as Record<string, unknown>);
    if (stale.length === 0) continue;

    changed += 1;
    console.log(
      `[cleanupPublicProfileFields] ${apply ? "deleting" : "would delete"} ${stale.join(", ")} — publicProfiles/${document.id}`,
    );
    if (!apply) continue;

    batch.update(document.ref, Object.fromEntries(stale.map((field) => [field, FieldValue.delete()])));
    pending += 1;
    if (pending === BATCH_LIMIT) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }

  if (apply && pending > 0) await batch.commit();
  return { scanned: snapshot.size, changed };
}

assertTargetAllowed();
initializeApp();

const { scanned, changed } = await cleanupPublicProfileFields();
console.log(
  `[cleanupPublicProfileFields] scanned ${scanned} profile(s); ${changed} ${apply ? "cleaned" : "would be cleaned"}.`,
);
if (!apply) console.log("[cleanupPublicProfileFields] DRY RUN — nothing written. Re-run with --apply to write.");
console.log("PUBLIC PROFILE CLEANUP DONE");
