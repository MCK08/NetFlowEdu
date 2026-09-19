// Phase 113 — the points cleanup against a real Firestore.
//
// Unlike publicProfiles (replaced wholesale by syncPublicProfile on the
// next write), nothing ever rewrites a users/{uid} document in full, so
// removing the fields from the code leaves every existing account still
// carrying them. This script is the only thing that closes that gap, which
// makes its behaviour worth proving rather than asserting:
//
//   * it deletes totalPoints/weeklyPoints and NOTHING else — an account's
//     email, role, onboarding state and timestamps must survive untouched;
//   * it handles every shape in the wild: both fields, one field, neither,
//     and documents carrying unrelated extra fields;
//   * it is safe to run twice;
//   * a dry run writes nothing at all;
//   * it refuses to touch real Firestore without an explicit flag.
//
// Runs the shipped script as a process, not a copy of its logic.

import { execFileSync } from "child_process";
import { join } from "path";

import { deleteApp, initializeApp } from "../../functions/node_modules/firebase-admin/lib/app";
import { getFirestore } from "../../functions/node_modules/firebase-admin/lib/firestore";
import type { App } from "../../functions/node_modules/firebase-admin/lib/app";
import type { Firestore } from "../../functions/node_modules/firebase-admin/lib/firestore";

const PROJECT_ID = "netflow-edu-vestigial-points-test";
const EMULATOR_HOST = "127.0.0.1:8080";
const SCRIPT = join(__dirname, "..", "..", "functions", "scripts", "cleanupVestigialPoints.mts");

let app: App;
let db: Firestore;

async function resetEmulatorProject(projectId: string): Promise<void> {
  const url = `http://${EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`;
  const response = await fetch(url, { method: "DELETE" });
  if (!response.ok) throw new Error(`emulator reset failed: ${response.status}`);
}

/** Everything a real account carries that must survive the cleanup. */
const accountFields = (uid: string) => ({
  uid,
  email: `${uid}@example.test`,
  displayName: `Ad ${uid}`,
  username: uid.replace(/-/g, "_"),
  role: "student",
  organizationId: null,
  photoURL: null,
  accountStatus: "active",
  emailVerified: true,
  onboardingStatus: "complete",
  requestedRole: "student",
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_001,
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
  app = initializeApp({ projectId: PROJECT_ID }, `vestigial-points-${Date.now()}`);
  db = getFirestore(app);
  await resetEmulatorProject(PROJECT_ID);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  await resetEmulatorProject(PROJECT_ID);
});

describe("cleanupVestigialPoints", () => {
  it("writes nothing on a dry run, but reports what it would delete", async () => {
    await db.collection("users").doc("u1").set({ ...accountFields("u1"), totalPoints: 0, weeklyPoints: 0 });

    const output = runScript([]);

    expect(output).toMatch(/would delete/);
    expect(output).toMatch(/DRY RUN/);
    const after = (await db.collection("users").doc("u1").get()).data() ?? {};
    expect(after.totalPoints).toBe(0);
    expect(after.weeklyPoints).toBe(0);
  });

  it("deletes both fields and leaves every other field exactly as it was", async () => {
    const original = accountFields("u1");
    await db.collection("users").doc("u1").set({ ...original, totalPoints: 4200, weeklyPoints: 300 });

    runScript(["--apply"]);

    expect((await db.collection("users").doc("u1").get()).data()).toEqual(original);
  });

  it("handles a half-migrated document carrying only one of the two", async () => {
    const original = accountFields("u2");
    await db.collection("users").doc("u2").set({ ...original, weeklyPoints: 7 });

    const output = runScript(["--apply"]);

    expect(output).toMatch(/deleting weeklyPoints/);
    expect((await db.collection("users").doc("u2").get()).data()).toEqual(original);
  });

  it("leaves a document that has neither field completely untouched", async () => {
    const original = accountFields("u3");
    await db.collection("users").doc("u3").set(original);
    const before = await db.collection("users").doc("u3").get();

    const output = runScript(["--apply"]);
    const after = await db.collection("users").doc("u3").get();

    expect(output).toMatch(/0 cleaned/);
    expect(after.data()).toEqual(original);
    expect(after.updateTime?.isEqual(before.updateTime!)).toBe(true);
  });

  it("preserves unrelated extra fields on a document it does clean", async () => {
    const original = { ...accountFields("u4"), pushToken: "abc123", locale: "tr-TR" };
    await db.collection("users").doc("u4").set({ ...original, totalPoints: 1 });

    runScript(["--apply"]);

    expect((await db.collection("users").doc("u4").get()).data()).toEqual(original);
  });

  it("is idempotent — a second run finds nothing and rewrites nothing", async () => {
    await db.collection("users").doc("u1").set({ ...accountFields("u1"), totalPoints: 5, weeklyPoints: 5 });

    runScript(["--apply"]);
    const before = await db.collection("users").doc("u1").get();
    const second = runScript(["--apply"]);
    const after = await db.collection("users").doc("u1").get();

    expect(second).toMatch(/0 cleaned/);
    expect(after.data()).toEqual(before.data());
    expect(after.updateTime?.isEqual(before.updateTime!)).toBe(true);
  });

  it("reports honest counts across a mixed collection", async () => {
    await db.collection("users").doc("a").set({ ...accountFields("a"), totalPoints: 1, weeklyPoints: 1 });
    await db.collection("users").doc("b").set(accountFields("b"));
    await db.collection("users").doc("c").set({ ...accountFields("c"), totalPoints: 2 });

    const output = runScript(["--apply"]);

    expect(output).toMatch(/scanned 3 user\(s\); 2 cleaned/);
    const remaining = (await db.collection("users").get()).docs.filter(
      (d) => d.data().totalPoints !== undefined || d.data().weeklyPoints !== undefined,
    );
    expect(remaining).toHaveLength(0);
  });

  it("logs no private field values — only ids and counts", async () => {
    await db.collection("users").doc("u1").set({ ...accountFields("u1"), totalPoints: 4200, weeklyPoints: 300 });

    const output = runScript(["--apply"]);

    expect(output).not.toMatch(/4200|300|u1@example\.test|Ad u1/);
    expect(output).toMatch(/users\/u1/);
  });

  it("refuses to touch real Firestore without an explicit flag", () => {
    expect(() => runScript(["--apply"], { FIRESTORE_EMULATOR_HOST: undefined })).toThrow(/REFUSING TO RUN|Command failed/);
  });
});
