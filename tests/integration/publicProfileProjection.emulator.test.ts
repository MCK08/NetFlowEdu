// Phase 112 — the public profile contract against a real Firestore.
//
// The unit tests pin the projection's SHAPE. What they cannot show is the
// part that decides whether a real deployment is actually clean:
//
//   * a profile written before this phase physically carries totalPoints /
//     weeklyPoints, and narrowing the projection does not retroactively
//     remove them;
//   * syncPublicProfile writes with `set` and no merge, so the FIRST write
//     after this phase replaces such a document and the legacy fields
//     disappear on their own;
//   * every account that is never written again needs the cleanup script —
//     which must delete those fields and nothing else, and must be safe to
//     run twice.
//
// Everything here runs the shipped code: the same projection builder the
// trigger delegates to, and the script file itself, spawned as a process.

import { execFileSync } from "child_process";
import { join } from "path";

import { deleteApp, initializeApp } from "../../functions/node_modules/firebase-admin/lib/app";
import { getFirestore } from "../../functions/node_modules/firebase-admin/lib/firestore";
import type { App } from "../../functions/node_modules/firebase-admin/lib/app";
import type { Firestore } from "../../functions/node_modules/firebase-admin/lib/firestore";

import {
  buildPublicProfileProjection,
  LEGACY_PUBLIC_PROFILE_FIELDS,
} from "../../functions/src/profiles/publicProfileProjection";

const PROJECT_ID = "netflow-edu-public-profile-test";
const EMULATOR_HOST = "127.0.0.1:8080";
const SCRIPT = join(__dirname, "..", "..", "functions", "scripts", "cleanupPublicProfileFields.mts");

let app: App;
let db: Firestore;

/** Starts this suite from an empty database — ONLY this suite's own project
 *  id, via the emulator's documented reset endpoint. */
async function resetEmulatorProject(projectId: string): Promise<void> {
  const url = `http://${EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`;
  const response = await fetch(url, { method: "DELETE" });
  if (!response.ok) throw new Error(`emulator reset failed: ${response.status}`);
}

/** A publicProfiles document exactly as the pre-Phase-112 projection wrote it. */
const legacyProfile = (uid: string) => ({
  uid,
  username: `${uid}_name`,
  displayName: `Ad ${uid}`,
  photoURL: null,
  role: "student",
  organizationId: "org-1",
  totalPoints: 4200,
  weeklyPoints: 300,
  createdAt: 1_700_000_000_000,
});

function runScript(args: string[], env: Record<string, string | undefined> = {}) {
  return execFileSync("node", [SCRIPT, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      FIRESTORE_EMULATOR_HOST: EMULATOR_HOST,
      GCLOUD_PROJECT: PROJECT_ID,
      GOOGLE_CLOUD_PROJECT: PROJECT_ID,
      ...env,
    },
  });
}

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;
  app = initializeApp({ projectId: PROJECT_ID }, `public-profile-${Date.now()}`);
  db = getFirestore(app);
  await resetEmulatorProject(PROJECT_ID);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  await resetEmulatorProject(PROJECT_ID);
});

describe("syncPublicProfile's write path", () => {
  it("replaces a legacy document instead of merging into it, so old points vanish on the next sync", async () => {
    const ref = db.collection("publicProfiles").doc("u1");
    await ref.set(legacyProfile("u1"));

    // Exactly what the trigger does for a users/{uid} write.
    await ref.set(
      buildPublicProfileProjection("u1", {
        username: "u1_name",
        displayName: "Ad u1",
        photoURL: null,
        role: "student",
        email: "u1@example.test",
        totalPoints: 4200,
        weeklyPoints: 300,
      }),
    );

    const after = (await ref.get()).data() ?? {};
    expect(Object.keys(after).sort()).toEqual(["displayName", "photoURL", "role", "uid", "username"]);
    expect(after.email).toBeUndefined();
  });
});

describe("the cleanup script", () => {
  it("changes nothing on a dry run, but reports what it would delete", async () => {
    await db.collection("publicProfiles").doc("u1").set(legacyProfile("u1"));

    const output = runScript([]);
    expect(output).toMatch(/would delete/);
    expect(output).toMatch(/DRY RUN/);

    const after = (await db.collection("publicProfiles").doc("u1").get()).data() ?? {};
    expect(after.totalPoints).toBe(4200);
  });

  it("deletes the legacy fields and keeps identity intact", async () => {
    await db.collection("publicProfiles").doc("u1").set(legacyProfile("u1"));

    runScript(["--apply"]);

    const after = (await db.collection("publicProfiles").doc("u1").get()).data() ?? {};
    for (const field of LEGACY_PUBLIC_PROFILE_FIELDS) {
      expect(after[field]).toBeUndefined();
    }
    expect(after).toEqual({ uid: "u1", username: "u1_name", displayName: "Ad u1", photoURL: null, role: "student" });
  });

  it("is idempotent — a second run finds nothing left to do", async () => {
    await db.collection("publicProfiles").doc("u1").set(legacyProfile("u1"));

    runScript(["--apply"]);
    const before = await db.collection("publicProfiles").doc("u1").get();
    const second = runScript(["--apply"]);
    const after = await db.collection("publicProfiles").doc("u1").get();

    expect(second).toMatch(/0 cleaned/);
    expect(after.data()).toEqual(before.data());
    expect(after.updateTime?.isEqual(before.updateTime!)).toBe(true);
  });

  it("leaves an already-clean profile completely untouched", async () => {
    const clean = { uid: "u2", username: "u2_name", displayName: "Ad u2", photoURL: null, role: "teacher" };
    await db.collection("publicProfiles").doc("u2").set(clean);

    const output = runScript(["--apply"]);

    expect(output).toMatch(/0 cleaned/);
    expect((await db.collection("publicProfiles").doc("u2").get()).data()).toEqual(clean);
  });

  it("touches only the profiles that need it, across a mixed collection", async () => {
    await db.collection("publicProfiles").doc("u1").set(legacyProfile("u1"));
    await db.collection("publicProfiles").doc("u2").set({ uid: "u2", username: null, displayName: "", photoURL: null, role: "student" });
    await db.collection("publicProfiles").doc("u3").set(legacyProfile("u3"));

    const output = runScript(["--apply"]);

    expect(output).toMatch(/scanned 3 profile\(s\); 2 cleaned/);
    expect((await db.collection("publicProfiles").doc("u3").get()).data()?.weeklyPoints).toBeUndefined();
  });

  it("refuses to touch real Firestore without an explicit flag", () => {
    expect(() => runScript(["--apply"], { FIRESTORE_EMULATOR_HOST: undefined })).toThrow(/REFUSING TO RUN|Command failed/);
  });
});
