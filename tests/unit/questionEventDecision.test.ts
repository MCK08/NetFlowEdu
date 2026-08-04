import {
  resolveAnswerEventRecipient,
  resolveQuestionEventRecipient,
} from "../../functions/src/notifications/questionEventDecision";

describe("resolveQuestionEventRecipient", () => {
  it("returns the owner for a student-owned question, different actor", () => {
    expect(resolveQuestionEventRecipient({ ownerId: "owner1", posterRole: "student" }, "actor1")).toBe(
      "owner1",
    );
  });

  it("returns null for a missing/deleted parent question", () => {
    expect(resolveQuestionEventRecipient(null, "actor1")).toBeNull();
  });

  it("returns null when the actor IS the owner (self-action)", () => {
    expect(
      resolveQuestionEventRecipient({ ownerId: "owner1", posterRole: "student" }, "owner1"),
    ).toBeNull();
  });

  // The teacher-question-notification-gap fix: there is no teacher-facing
  // question-detail screen, so a teacher-owned question never produces a
  // recipient — see the module's own doc comment.
  it("returns null for a teacher-owned question (no usable destination exists yet)", () => {
    expect(
      resolveQuestionEventRecipient({ ownerId: "teacher1", posterRole: "teacher" }, "actor1"),
    ).toBeNull();
  });

  it("defaults a MISSING posterRole to teacher (legacy pre-Phase-9.1 documents), matching the client's own toQuestion() default", () => {
    expect(resolveQuestionEventRecipient({ ownerId: "owner1" }, "actor1")).toBeNull();
    expect(resolveQuestionEventRecipient({ ownerId: "owner1", posterRole: null }, "actor1")).toBeNull();
  });

  it("student-owned takes priority evaluation-order-wise: self-check still applies even for a teacher-owned question", () => {
    // Order shouldn't matter for correctness, but confirms neither branch
    // masks the other incorrectly.
    expect(
      resolveQuestionEventRecipient({ ownerId: "teacher1", posterRole: "teacher" }, "teacher1"),
    ).toBeNull();
  });
});

describe("resolveAnswerEventRecipient", () => {
  it("returns the owner for a student-owned answer, different actor", () => {
    expect(resolveAnswerEventRecipient({ ownerId: "aOwner", ownerRole: "student" }, "liker1")).toBe(
      "aOwner",
    );
  });

  it("returns null for a missing/deleted answer", () => {
    expect(resolveAnswerEventRecipient(null, "liker1")).toBeNull();
  });

  it("returns null when the actor IS the answer owner (self-like, unreachable via UI but guarded anyway)", () => {
    expect(
      resolveAnswerEventRecipient({ ownerId: "aOwner", ownerRole: "student" }, "aOwner"),
    ).toBeNull();
  });

  it("returns null for a teacher-owned answer (no shipped route lets a teacher own an answer, but the guard checks the real role)", () => {
    expect(
      resolveAnswerEventRecipient({ ownerId: "aOwner", ownerRole: "teacher" }, "liker1"),
    ).toBeNull();
  });

  it("treats a missing ownerRole as non-teacher (never blocks a normal student answer merely for lacking a role field)", () => {
    expect(resolveAnswerEventRecipient({ ownerId: "aOwner" }, "liker1")).toBe("aOwner");
  });
});
