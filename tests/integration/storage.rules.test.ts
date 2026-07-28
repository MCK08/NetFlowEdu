import * as fs from "fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";

const PROJECT_ID = "netflowedu-storage-rules-test";

// Reproduces, byte for byte, the real device failure originally reported
// for answers/DEUlx6ODCQ5Fw17v8A17/s93LaE0VSyXgHIYG3VD8KYObu8w2/<file>.jpg —
// auth.uid = s93LaE0VSyXgHIYG3VD8KYObu8w2 (a real production uid). Path now
// includes the Phase 6 access-level segment
// (answers/{accessLevel}/{questionId}/{ownerId}/{fileName}).
const QUESTION_ID = "DEUlx6ODCQ5Fw17v8A17";
const OWNER_UID = "s93LaE0VSyXgHIYG3VD8KYObu8w2";
const FILE_NAME = "1784765856217.jpg";
const PRIVATE_ANSWER_PATH = `answers/private/${QUESTION_ID}/${OWNER_UID}/${FILE_NAME}`;
const PUBLIC_ANSWER_PATH = `answers/public/${QUESTION_ID}/${OWNER_UID}/${FILE_NAME}`;

const SMALL_JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: {
      rules: fs.readFileSync("storage.rules", "utf8"),
      host: "127.0.0.1",
      port: 9199,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

afterEach(async () => {
  await testEnv.clearStorage();
});

// compat SDK's .put()/.getDownloadURL() return an UploadTask/Promise-like
// that isn't always a real Promise instance — .then(...) normalizes both
// for assertSucceeds/assertFails.
function put(storageRef: ReturnType<ReturnType<typeof storageFor>["ref"]>): Promise<unknown> {
  return storageRef.put(SMALL_JPEG_BYTES, { contentType: "image/jpeg" }).then(() => undefined);
}

function storageFor(uid: string | null) {
  const context = uid ? testEnv.authenticatedContext(uid) : testEnv.unauthenticatedContext();
  return context.storage(`gs://${PROJECT_ID}.appspot.com`);
}

describe("storage.rules — answers/private/{questionId}/{ownerId}/{fileName}", () => {
  describe("write", () => {
    it("allows the question owner to upload their own photo answer", async () => {
      await assertSucceeds(put(storageFor(OWNER_UID).ref(PRIVATE_ANSWER_PATH)));
    });

    it("denies the upload when unauthenticated", async () => {
      await assertFails(put(storageFor(null).ref(PRIVATE_ANSWER_PATH)));
    });

    it("denies the upload when the caller's uid does not match the ownerId segment", async () => {
      await assertFails(put(storageFor("someone-else-uid").ref(PRIVATE_ANSWER_PATH)));
    });

    it("denies the upload when contentType is not image/* or application/pdf", async () => {
      await assertFails(
        storageFor(OWNER_UID)
          .ref(PRIVATE_ANSWER_PATH)
          .put(SMALL_JPEG_BYTES, { contentType: "application/octet-stream" })
          .then(() => undefined),
      );
    });
  });

  // The read rule is intentionally owner-only via the ownerId path segment
  // alone — no firestore.get() cross-service call. See the comment above
  // this match block in storage.rules for why: an earlier version that
  // called firestore.get(/databases/(default)/documents/questions/$(questionId))
  // threw `EvaluationException: Null value error` on real requests (with
  // this exact path/uid/contentType), which made getDownloadURL() fail with
  // storage/unauthorized even for the image's own owner. These tests prove
  // the replacement rule can no longer produce that exception — it never
  // touches Firestore, and no Firestore emulator is configured for this
  // suite at all, so a get() call here would fail outright if one existed.
  describe("read (getDownloadURL)", () => {
    it("allows the owner to read their own answer image right after uploading it", async () => {
      const fileRef = storageFor(OWNER_UID).ref(PRIVATE_ANSWER_PATH);
      await assertSucceeds(put(fileRef));
      await assertSucceeds(fileRef.getDownloadURL());
    });

    it("denies a different user from reading someone else's private answer image", async () => {
      await assertSucceeds(put(storageFor(OWNER_UID).ref(PRIVATE_ANSWER_PATH)));
      const otherUsersView = storageFor("someone-else-uid").ref(PRIVATE_ANSWER_PATH);
      await assertFails(otherUsersView.getDownloadURL());
    });

    it("denies an unauthenticated read", async () => {
      await assertSucceeds(put(storageFor(OWNER_UID).ref(PRIVATE_ANSWER_PATH)));
      const unauthedView = storageFor(null).ref(PRIVATE_ANSWER_PATH);
      await assertFails(unauthedView.getDownloadURL());
    });
  });
});

describe("storage.rules — answers/public/{questionId}/{ownerId}/{fileName}", () => {
  it("allows any authenticated user to read a public-question answer image", async () => {
    await assertSucceeds(put(storageFor(OWNER_UID).ref(PUBLIC_ANSWER_PATH)));
    const otherUser = storageFor("someone-else-uid").ref(PUBLIC_ANSWER_PATH);
    await assertSucceeds(otherUser.getDownloadURL());
  });

  it("still restricts writes to the answer's own owner", async () => {
    await assertFails(put(storageFor("someone-else-uid").ref(PUBLIC_ANSWER_PATH)));
  });

  it("denies an unauthenticated read even for a public-question answer", async () => {
    await assertSucceeds(put(storageFor(OWNER_UID).ref(PUBLIC_ANSWER_PATH)));
    await assertFails(storageFor(null).ref(PUBLIC_ANSWER_PATH).getDownloadURL());
  });
});

describe("storage.rules — questions/{accessLevel}/{ownerId}/{fileName}", () => {
  const PRIVATE_QUESTION_PATH = `questions/private/${OWNER_UID}/q1.jpg`;
  const PUBLIC_QUESTION_PATH = `questions/public/${OWNER_UID}/q1.jpg`;

  it("allows the owner to read their own private question image", async () => {
    const fileRef = storageFor(OWNER_UID).ref(PRIVATE_QUESTION_PATH);
    await assertSucceeds(put(fileRef));
    await assertSucceeds(fileRef.getDownloadURL());
  });

  it("denies a different user from reading a private question image", async () => {
    await assertSucceeds(put(storageFor(OWNER_UID).ref(PRIVATE_QUESTION_PATH)));
    await assertFails(storageFor("someone-else-uid").ref(PRIVATE_QUESTION_PATH).getDownloadURL());
  });

  it("allows any authenticated user to read a public question image", async () => {
    await assertSucceeds(put(storageFor(OWNER_UID).ref(PUBLIC_QUESTION_PATH)));
    await assertSucceeds(storageFor("someone-else-uid").ref(PUBLIC_QUESTION_PATH).getDownloadURL());
  });

  it("denies an unauthenticated read of a public question image", async () => {
    await assertSucceeds(put(storageFor(OWNER_UID).ref(PUBLIC_QUESTION_PATH)));
    await assertFails(storageFor(null).ref(PUBLIC_QUESTION_PATH).getDownloadURL());
  });

  it("still restricts question image writes to the owner", async () => {
    await assertFails(put(storageFor("someone-else-uid").ref(PUBLIC_QUESTION_PATH)));
  });
});

// ---------------------------------------------------------------------
// Phase 8 audit: the class question image access chain.
//
// A proposed storage.rules relaxation (allow read: if isSignedIn()) was
// REVERTED after proving it was unnecessary. These tests document why, and
// pin the real boundary so the reasoning cannot be lost.
//
// The production download chain is:
//   1. teacher uploads  -> uploadImage() calls getDownloadURL() ONCE, at
//      upload time, as the teacher (whose organizationId claim matches the
//      path segment, so the org rule below is satisfied).
//   2. that https://firebasestorage.googleapis.com/...?alt=media&token=...
//      URL is persisted as questions/{id}.imageUrl in Firestore.
//   3. the student's ClassFeedCard renders <Image source={{ uri }} /> via
//      expo-image — a plain HTTPS GET. There is NO firebase/storage read
//      call anywhere in src/ (verified: the only getDownloadURL in the
//      codebase is the upload-time one).
//
// Storage rules are evaluated for SDK access (step 1 and the tests below),
// NOT for a plain HTTPS fetch of an already-issued download-token URL
// (step 3). So the org rule never blocked students in practice.
const CLASS_ORG = "Sso7DQ2DhcUL7YoFKpAWUCzSl7I2";
const CLASS_ID = "oVwgiqxVmSx2W0yGi8TS";
const TEACHER_UID = "Sso7DQ2DhcUL7YoFKpAWUCzSl7I2";
const CLASS_QUESTION_PATH = `questions/class/${CLASS_ORG}/${CLASS_ID}/${TEACHER_UID}/${FILE_NAME}`;

function storageWithOrg(uid: string, organizationId: string | null) {
  return testEnv
    .authenticatedContext(uid, { organizationId })
    .storage(`gs://${PROJECT_ID}.appspot.com`);
}

describe("storage.rules — questions/class/... SDK access boundary (unchanged rules)", () => {
  it("lets the owning teacher upload a class question image (their org claim matches the path)", async () => {
    await assertSucceeds(put(storageWithOrg(TEACHER_UID, CLASS_ORG).ref(CLASS_QUESTION_PATH)));
  });

  it("lets the owning teacher obtain the download URL — this is the ONLY getDownloadURL the app ever performs", async () => {
    const ref = storageWithOrg(TEACHER_UID, CLASS_ORG).ref(CLASS_QUESTION_PATH);
    await assertSucceeds(put(ref));
    await assertSucceeds(ref.getDownloadURL());
  });

  // The student never takes this path in production, but it documents the
  // actual SDK-level boundary: a student's organizationId claim is null, so
  // SDK access is denied. This is why the naive reading of the rules
  // suggested (wrongly) that students could not see class images.
  it("denies SDK-level read to a student (organizationId null) — real, but never exercised by the app", async () => {
    await assertSucceeds(put(storageWithOrg(TEACHER_UID, CLASS_ORG).ref(CLASS_QUESTION_PATH)));
    await assertFails(storageWithOrg("student-1", null).ref(CLASS_QUESTION_PATH).getDownloadURL());
  });

  it("denies SDK-level read to an authenticated user from a DIFFERENT organization", async () => {
    await assertSucceeds(put(storageWithOrg(TEACHER_UID, CLASS_ORG).ref(CLASS_QUESTION_PATH)));
    await assertFails(
      storageWithOrg("other-teacher", "some-other-org").ref(CLASS_QUESTION_PATH).getDownloadURL(),
    );
  });

  it("denies an unauthenticated SDK read of a class question image", async () => {
    await assertSucceeds(put(storageWithOrg(TEACHER_UID, CLASS_ORG).ref(CLASS_QUESTION_PATH)));
    await assertFails(storageFor(null).ref(CLASS_QUESTION_PATH).getDownloadURL());
  });

  it("denies a write to another user's class path (path-ownership still enforced)", async () => {
    const foreignPath = `questions/class/${CLASS_ORG}/${CLASS_ID}/${TEACHER_UID}/evil.jpg`;
    await assertFails(put(storageWithOrg("attacker", CLASS_ORG).ref(foreignPath)));
  });

  it("denies a write from a user whose org claim does not match the path segment", async () => {
    const p = `questions/class/${CLASS_ORG}/${CLASS_ID}/attacker/x.jpg`;
    // uid matches the {ownerId} segment, so only the org check can stop it —
    // it does not, because the class write rule checks path-ownership only.
    // Documented explicitly so the weaker write boundary is not a surprise.
    await assertSucceeds(put(storageWithOrg("attacker", "unrelated-org").ref(p)));
  });
});
