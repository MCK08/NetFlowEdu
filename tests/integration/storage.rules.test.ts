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
// auth.uid = s93LaE0VSyXgHIYG3VD8KYObu8w2 (a real production uid), path
// shape matches storage.rules `answers/{questionId}/{ownerId}/{fileName}`
// exactly.
const QUESTION_ID = "DEUlx6ODCQ5Fw17v8A17";
const OWNER_UID = "s93LaE0VSyXgHIYG3VD8KYObu8w2";
const FILE_NAME = "1784765856217.jpg";
const PATH = `answers/${QUESTION_ID}/${OWNER_UID}/${FILE_NAME}`;

const SMALL_JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

describe("storage.rules — answers/{questionId}/{ownerId}/{fileName}", () => {
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

  describe("write", () => {
    it("allows the question owner to upload their own photo answer", async () => {
      await assertSucceeds(put(storageFor(OWNER_UID).ref(PATH)));
    });

    it("denies the upload when unauthenticated", async () => {
      await assertFails(put(storageFor(null).ref(PATH)));
    });

    it("denies the upload when the caller's uid does not match the ownerId segment", async () => {
      await assertFails(put(storageFor("someone-else-uid").ref(PATH)));
    });

    it("denies the upload when contentType is not image/* or application/pdf", async () => {
      await assertFails(
        storageFor(OWNER_UID)
          .ref(PATH)
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
      const fileRef = storageFor(OWNER_UID).ref(PATH);
      await assertSucceeds(put(fileRef));
      await assertSucceeds(fileRef.getDownloadURL());
    });

    it("denies a different user from reading someone else's answer image", async () => {
      await assertSucceeds(put(storageFor(OWNER_UID).ref(PATH)));
      const otherUsersView = storageFor("someone-else-uid").ref(PATH);
      await assertFails(otherUsersView.getDownloadURL());
    });

    it("denies an unauthenticated read", async () => {
      await assertSucceeds(put(storageFor(OWNER_UID).ref(PATH)));
      const unauthedView = storageFor(null).ref(PATH);
      await assertFails(unauthedView.getDownloadURL());
    });
  });
});
