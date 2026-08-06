import {
  buildQuarantinePath,
  getAnswerContentType,
  getAnswerFileExtension,
} from "@services/storage/answerImagePath";

import {
  buildApprovedAnswerPath,
  buildQuarantinePath as serverQuarantinePath,
  isOwnedQuarantinePath,
} from "../../functions/src/moderation/answerPublication";

describe("getAnswerFileExtension", () => {
  it("uses png for drawing answers", () => {
    expect(getAnswerFileExtension("drawing")).toBe("png");
  });

  it("uses jpg for photo answers", () => {
    expect(getAnswerFileExtension("photo")).toBe("jpg");
  });
});

describe("getAnswerContentType", () => {
  it("is exactly image/png for drawing answers", () => {
    expect(getAnswerContentType("drawing")).toBe("image/png");
  });

  it("is exactly image/jpeg for photo answers", () => {
    expect(getAnswerContentType("photo")).toBe("image/jpeg");
  });
});

// Phase 17B replaced buildAnswerImagePath (client-chosen answer destination)
// with a quarantine path the client writes and an approved path only the
// server writes. These tests cover the replacement.
describe("quarantine path", () => {
  it("matches storage.rules moderation/pending/{ownerId}/{submissionId}/{fileName}", () => {
    expect(buildQuarantinePath("user-1", "user-1_op-abcdefgh", "image/png")).toBe(
      "moderation/pending/user-1/user-1_op-abcdefgh/upload.png",
    );
  });

  it("uses jpg for a photo content type", () => {
    expect(buildQuarantinePath("user-1", "sub-1", "image/jpeg")).toBe(
      "moderation/pending/user-1/sub-1/upload.jpg",
    );
  });

  it("is byte-identical to the path the SERVER rebuilds", () => {
    // The server does not trust the client's path — it rebuilds this and
    // compares. If the two ever drift, every answer submission fails closed
    // with permission-denied, so this is the test that keeps them in step.
    for (const mime of ["image/png", "image/jpeg"]) {
      expect(buildQuarantinePath("user-1", "sub-1", mime)).toBe(
        serverQuarantinePath("user-1", "sub-1", mime),
      );
    }
  });

  it("is deterministic, so a retry overwrites rather than orphaning", () => {
    expect(buildQuarantinePath("user-1", "sub-1", "image/png")).toBe(
      buildQuarantinePath("user-1", "sub-1", "image/png"),
    );
  });
});

describe("isOwnedQuarantinePath", () => {
  const uid = "user-1";
  const submissionId = "user-1_op-abcdefgh";
  const mime = "image/png";
  const valid = serverQuarantinePath(uid, submissionId, mime);

  it("accepts the caller's own path for this submission", () => {
    expect(isOwnedQuarantinePath(valid, uid, submissionId, mime)).toBe(true);
  });

  it("rejects another user's quarantine folder", () => {
    const other = serverQuarantinePath("attacker", submissionId, mime);
    expect(isOwnedQuarantinePath(other, uid, submissionId, mime)).toBe(false);
  });

  it("rejects a different submission's folder", () => {
    const other = serverQuarantinePath(uid, "someone-elses-submission", mime);
    expect(isOwnedQuarantinePath(other, uid, submissionId, mime)).toBe(false);
  });

  it("rejects a path aimed at the already-approved answers tree", () => {
    // The most direct bypass: point the server at a file that is already
    // world-readable so it publishes without analysing anything new.
    expect(isOwnedQuarantinePath("answers/public/q1/user-1/x.png", uid, submissionId, mime)).toBe(
      false,
    );
  });

  it("rejects traversal", () => {
    expect(
      isOwnedQuarantinePath(
        `moderation/pending/${uid}/${submissionId}/../../../answers/public/x.png`,
        uid,
        submissionId,
        mime,
      ),
    ).toBe(false);
  });

  it("rejects a non-string path", () => {
    expect(isOwnedQuarantinePath(undefined, uid, submissionId, mime)).toBe(false);
    expect(isOwnedQuarantinePath(42, uid, submissionId, mime)).toBe(false);
  });
});

describe("buildApprovedAnswerPath", () => {
  it("mirrors the question visibility, so the unchanged read rules still apply", () => {
    expect(buildApprovedAnswerPath("public", "q1", "user-1", "sub-1", "image/png")).toBe(
      "answers/public/q1/user-1/sub-1.png",
    );
    expect(buildApprovedAnswerPath("private", "q1", "user-1", "sub-1", "image/jpeg")).toBe(
      "answers/private/q1/user-1/sub-1.jpg",
    );
  });

  it("collapses class visibility onto the private access level", () => {
    // Same collapse the pre-existing answer paths used.
    expect(buildApprovedAnswerPath("class", "q1", "user-1", "sub-1", "image/png")).toBe(
      "answers/private/q1/user-1/sub-1.png",
    );
  });

  it("treats an unknown visibility as private, never public", () => {
    // Fail-safe direction: a corrupt question document must not widen access.
    expect(buildApprovedAnswerPath("nonsense", "q1", "user-1", "sub-1", "image/png")).toBe(
      "answers/private/q1/user-1/sub-1.png",
    );
  });

  it("is named by submissionId, so publishing twice overwrites one object", () => {
    expect(buildApprovedAnswerPath("public", "q1", "user-1", "sub-1", "image/png")).toBe(
      buildApprovedAnswerPath("public", "q1", "user-1", "sub-1", "image/png"),
    );
  });
});
