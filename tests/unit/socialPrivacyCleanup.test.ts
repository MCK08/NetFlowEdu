import { existsSync, readFileSync } from "fs";
import { join } from "path";

import {
  buildPublicProfileProjection,
  LEGACY_PUBLIC_PROFILE_FIELDS,
} from "../../functions/src/profiles/publicProfileProjection";

// publicProfile.ts also exports the Firestore-backed getter, so importing
// the pure mapper otherwise drags the real SDK (and expo-constants) in.
jest.mock("firebase/firestore", () => ({ doc: jest.fn(), getDoc: jest.fn() }));
jest.mock("../../src/services/firebase/config", () => ({ db: {} }));

// eslint-disable-next-line import/first
import { toPublicProfile } from "../../src/services/firebase/publicProfile";

// Phase 112 — public social surfaces carry identity, never a measurement.
//
// Phase 110 decided this for class surfaces (no leaderboard, no ranking, no
// peer comparison). The stored data had not caught up: publicProfiles —
// readable by EVERY authenticated user — still carried totalPoints and
// weeklyPoints, and a peer's profile rendered both. These tests pin the
// contract at its two ends (what the server writes, what the client reads)
// and at the surfaces a peer actually sees.
//
// Private self-progress is explicitly NOT the target: a user's own numbers
// live in the owner-only users/{uid} document and stay there.

const ROOT = join(__dirname, "..", "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");
// Prose explaining why a measurement is absent must not read as one.
const code = (relative: string) =>
  read(relative).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// Anything that reads as someone else's score, in either language.
const MEASUREMENT = /totalPoints|weeklyPoints|\brank\b|ranking|leaderboard|liderlik|sıralama|percentile|yüzdelik|streak|accuracy|başarı oranı/i;

const USER_DOCUMENT = {
  uid: "u1",
  email: "u1@example.test",
  username: "student_one",
  displayName: "Student One",
  photoURL: "https://example.test/a.png",
  role: "student",
  organizationId: "org-1",
  accountStatus: "active",
  totalPoints: 4200,
  weeklyPoints: 300,
  createdAt: 1_700_000_000_000,
};

describe("§3 the public profile projection", () => {
  it("publishes identity and nothing else", () => {
    expect(buildPublicProfileProjection("u1", USER_DOCUMENT)).toEqual({
      uid: "u1",
      username: "student_one",
      displayName: "Student One",
      photoURL: "https://example.test/a.png",
      role: "student",
    });
  });

  it("drops every field that could be read as a score, not just points", () => {
    const projection = buildPublicProfileProjection("u1", USER_DOCUMENT) as unknown as Record<string, unknown>;
    for (const field of ["totalPoints", "weeklyPoints", "email", "accountStatus", "organizationId", "createdAt"]) {
      expect(projection[field]).toBeUndefined();
    }
  });

  // The projection is a whitelist, so a field added to users/{uid} later
  // cannot become public just because someone forgot this file exists.
  it("ignores unknown fields rather than copying them through", () => {
    const projection = buildPublicProfileProjection("u1", {
      ...USER_DOCUMENT,
      futureMasteryScore: 99,
    }) as unknown as Record<string, unknown>;
    expect(projection.futureMasteryScore).toBeUndefined();
    expect(Object.keys(projection).sort()).toEqual(["displayName", "photoURL", "role", "uid", "username"]);
  });

  it("still fills in the identity a name, avatar and badge need when the source is sparse", () => {
    expect(buildPublicProfileProjection("u2", {})).toEqual({
      uid: "u2",
      username: null,
      displayName: "",
      photoURL: null,
      role: "student",
    });
  });

  it("names every legacy field the cleanup has to delete", () => {
    expect([...LEGACY_PUBLIC_PROFILE_FIELDS].sort()).toEqual([
      "createdAt",
      "organizationId",
      "totalPoints",
      "weeklyPoints",
    ]);
  });

  it("is what syncPublicProfile writes — the trigger builds no shape of its own", () => {
    const source = read("functions/src/profiles/syncPublicProfile.ts");
    expect(source).toContain("publicRef.set(buildPublicProfileProjection(uid, data))");
    expect(source).not.toMatch(/totalPoints|weeklyPoints/);
  });
});

describe("§3 the client reads the same contract", () => {
  it("maps a document to identity only", () => {
    expect(toPublicProfile("u1", USER_DOCUMENT)).toEqual({
      uid: "u1",
      username: "student_one",
      displayName: "Student One",
      photoURL: "https://example.test/a.png",
      role: "student",
    });
  });

  // Until every profile has been rewritten or cleaned up, some documents
  // still physically carry the old fields. The mapper must not surface them.
  it("ignores legacy fields still present in an old document", () => {
    const mapped = toPublicProfile("u1", USER_DOCUMENT) as unknown as Record<string, unknown>;
    for (const field of LEGACY_PUBLIC_PROFILE_FIELDS) {
      expect(mapped[field]).toBeUndefined();
    }
  });

  it("keeps the identity fields search, friends and avatars depend on", () => {
    const mapped = toPublicProfile("u3", { username: "u3", displayName: "Three", photoURL: null, role: "teacher" });
    expect(mapped).toEqual({ uid: "u3", username: "u3", displayName: "Three", photoURL: null, role: "teacher" });
  });

  it("declares no measurement field on the shared type", () => {
    expect(code("src/types/publicProfile.ts")).not.toMatch(MEASUREMENT);
  });
});

describe("§8 peer-visible surfaces show no measurement", () => {
  // profileStats.ts joined this list in Phase 113: it used to be excluded
  // because it still built the OWNER's own "Puan" from private data, and
  // that stat is now gone entirely (nothing ever awarded a point).
  for (const file of [
    "src/features/profile/screens/PublicProfileScreen.tsx",
    "src/features/profile/services/profileStats.ts",
    "src/features/friends/components/FriendRow.tsx",
    "src/features/friends/screens/FindFriendsScreen.tsx",
    "src/features/friends/screens/FriendsScreen.tsx",
    "src/features/classes/components/ClassmatesPreview.tsx",
    "src/features/classes/screens/ClassmatesScreen.tsx",
  ]) {
    it(`renders no score on ${file.split("/").pop()}`, () => {
      expect(code(file)).not.toMatch(MEASUREMENT);
    });
  }

  it("leaves a peer's profile with no stats row at all, rather than an empty one", () => {
    const screen = read("src/features/profile/screens/PublicProfileScreen.tsx");
    expect(screen).not.toContain("ProfileStatsRow");
    expect(screen).not.toContain("publicProfileStats");
  });
});

describe("§7 the leaderboard surface is gone", () => {
  it("has no leaderboards rule, so legacy documents are denied by default", () => {
    const rules = read("firestore.rules");
    expect(rules).not.toMatch(/match \/leaderboards/);
  });

  it("keeps no empty feature folder inviting someone to build one", () => {
    expect(existsSync(join(ROOT, "src/features/leaderboards"))).toBe(false);
  });

  it("keeps no index for a ranking query", () => {
    const indexes = JSON.parse(read("firestore.indexes.json")) as {
      indexes: { collectionGroup: string; fields: { fieldPath: string }[] }[];
    };
    expect(indexes.indexes.some((index) => index.collectionGroup === "leaderboards")).toBe(false);
    expect(indexes.indexes.some((index) => index.fields.some((f) => f.fieldPath === "score"))).toBe(false);
  });
});

describe("§9/§10/§11 nothing else moved", () => {
  // Phase 112 pinned totalPoints/weeklyPoints as private-but-present: this
  // phase only changed what was PUBLISHED. Phase 113 then removed the
  // system outright (nothing ever awarded a point), so what survives here
  // is the guarantee that a client cannot write the fields — see
  // tests/unit/vestigialPointsRemoval.test.ts for the removal itself.
  it("still refuses to let a client write the removed points fields", () => {
    const rules = read("firestore.rules");
    expect(rules).toMatch(/request\.resource\.data\.get\('totalPoints', null\)/);
    expect(rules).toMatch(/hasOnly\(\['displayName', 'photoURL', 'updatedAt'\]\)/);
  });

  it("keeps publicProfiles server-written and readable only to signed-in users", () => {
    const rules = read("firestore.rules");
    const block = rules.slice(rules.indexOf("match /publicProfiles/{uid}"));
    expect(block.slice(0, 200)).toMatch(/allow read: if isSignedIn\(\);/);
    expect(block.slice(0, 200)).toMatch(/allow write: if false;/);
  });

  it("keeps the Phase 110 class pulse aggregate-only and kudos uncounted", () => {
    const pulse = read("src/features/classes/components/ClassPulseCard.tsx");
    expect(pulse).not.toMatch(/\brank\b|liderlik|sıralama/i);
    expect(read("src/features/classes/services/classSocial.ts")).not.toMatch(/totalPoints|weeklyPoints/);
  });

  it("keeps both tab architectures exactly as Phase 109/111 left them", () => {
    const titles = (layout: string) => [...read(layout).matchAll(/title: "([^"]+)"/g)].map((m) => m[1]);
    expect(titles("app/(student)/(tabs)/_layout.tsx")).toEqual(["Akış", "Çalış", "Sınıf", "Profil"]);
    expect(titles("app/(teacher)/(tabs)/_layout.tsx")).toEqual(["Bugün", "Sınıflar", "Aksiyonlar", "Profil"]);
  });
});
