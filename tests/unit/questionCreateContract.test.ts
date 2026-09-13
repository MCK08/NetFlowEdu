// Phase 89 — the pure half of the question CREATE contract.
//
// Everything here is a decision the server makes before it touches Firestore:
// what a legal scope is, whether an image belongs to its author, what one
// submission means, and when a draft is a coherent question at all. The
// emulator matrix proves the same decisions survive a real transaction; this
// proves the decisions themselves.
//
// It also holds the taxonomy mirror in place. `functions/` cannot import
// `src/features/...` (Phase 88 verified the rootDir constraint rather than
// assuming it), so the subject, grade and topic lists exist on both sides —
// and the last block below fails if they ever drift apart.

import {
  buildQuestionCreateDraft,
  createdQuestionId,
  GRADE_LEVELS,
  isOwnedQuestionImagePath,
  isValidOperationId,
  MAX_OPERATION_ID_LENGTH,
  MIN_OPERATION_ID_LENGTH,
  QUESTION_SUBJECTS,
  sanitizeQuestionScope,
  storageObjectPath,
  topicsForSubject,
} from "../../functions/src/questions/questionCreate";

const UID = "teacher-1";
const CLASS_ID = "class-1";
const CLASS_IMAGE = `https://firebasestorage.googleapis.com/v0/b/bucket.appspot.com/o/${encodeURIComponent(
  `questions/class/org-1/${CLASS_ID}/${UID}/1700000000000.jpg`,
)}?alt=media&token=abc`;
const PRIVATE_IMAGE = `https://firebasestorage.googleapis.com/v0/b/bucket.appspot.com/o/${encodeURIComponent(
  `questions/private/${UID}/1700000000000.jpg`,
)}?alt=media&token=abc`;

function classDraft(over: Record<string, unknown> = {}) {
  return buildQuestionCreateDraft(
    {
      imageUrl: CLASS_IMAGE,
      subject: "Matematik",
      topic: "Denklemler",
      gradeLevel: "8",
      description: "3x + 4 = 16 denkleminde x kaçtır?",
      choices: { A: "x = 4", B: "x = -4", C: "x = 12" },
      correctChoice: "A",
      hints: ["Sabiti karşı tarafa geçir."],
      ...over,
    },
    UID,
    "class",
    CLASS_ID,
  );
}

/** The draft, or a failure if the case was supposed to be accepted. */
function draftOf(result: ReturnType<typeof buildQuestionCreateDraft>) {
  if ("rejection" in result) throw new Error(`unexpectedly rejected: ${result.rejection}`);
  return result.draft;
}

describe("scope", () => {
  it("accepts a fully specified, in-taxonomy scope", () => {
    expect(sanitizeQuestionScope({ subject: "Matematik", topic: "Denklemler", gradeLevel: "8" }))
      .toEqual({ subject: "Matematik", topic: "Denklemler", gradeLevel: "8" });
  });

  it("C21 accepts a COMPLETELY EMPTY scope, because a live path creates one", () => {
    // The teacher's one-tap class capture (useClassUpload → TeacherClassDetail)
    // has shown no metadata form since Phase 21 and writes "" for all three.
    // Requiring a taxonomy value here would delete that path.
    expect(sanitizeQuestionScope({})).toEqual({ subject: "", topic: "", gradeLevel: "" });
    expect(sanitizeQuestionScope({ subject: "", topic: "", gradeLevel: "" }))
      .toEqual({ subject: "", topic: "", gradeLevel: "" });
  });

  it("trims before judging", () => {
    expect(sanitizeQuestionScope({ subject: "  Matematik  ", gradeLevel: " 8 " }))
      .toEqual({ subject: "Matematik", topic: "", gradeLevel: "8" });
  });

  it("rejects a subject outside the taxonomy", () => {
    expect(sanitizeQuestionScope({ subject: "Simya" })).toBeNull();
  });

  it("rejects a grade outside the taxonomy", () => {
    expect(sanitizeQuestionScope({ subject: "Matematik", gradeLevel: "42" })).toBeNull();
  });

  it("rejects a topic that belongs to a DIFFERENT subject", () => {
    // "Mekanik" is a Fizik topic. A flattened global topic list would let it
    // through on a Matematik question; checking against the subject's own list
    // is what stops that.
    expect(sanitizeQuestionScope({ subject: "Matematik", topic: "Mekanik" })).toBeNull();
    expect(sanitizeQuestionScope({ subject: "Fizik", topic: "Mekanik" }))
      .toEqual({ subject: "Fizik", topic: "Mekanik", gradeLevel: "" });
  });

  it("rejects a topic with no subject to interpret it against", () => {
    expect(sanitizeQuestionScope({ topic: "Denklemler" })).toBeNull();
  });

  it("gives an uncurated subject the fallback topic", () => {
    expect(topicsForSubject("Diğer")).toEqual(["Diğer"]);
    expect(sanitizeQuestionScope({ subject: "Diğer", topic: "Diğer" }))
      .toEqual({ subject: "Diğer", topic: "Diğer", gradeLevel: "" });
  });
});

describe("image ownership", () => {
  it("reads the object path out of a download URL", () => {
    expect(storageObjectPath(CLASS_IMAGE)).toBe(`questions/class/org-1/${CLASS_ID}/${UID}/1700000000000.jpg`);
  });

  it("reads it from an emulator URL too, because the host is not the point", () => {
    const emulator = `http://127.0.0.1:9199/v0/b/bucket/o/${encodeURIComponent(
      `questions/private/${UID}/x.jpg`,
    )}?alt=media&token=t`;
    expect(storageObjectPath(emulator)).toBe(`questions/private/${UID}/x.jpg`);
  });

  it("refuses junk, traversal and non-strings", () => {
    expect(storageObjectPath("https://evil.test/tracker.png")).toBeNull();
    expect(storageObjectPath(`https://x/v0/b/b/o/${encodeURIComponent("questions/../../etc/passwd")}`)).toBeNull();
    expect(storageObjectPath(null)).toBeNull();
    expect(storageObjectPath("x".repeat(3000))).toBeNull();
  });

  it("accepts a class image under this author and this class", () => {
    expect(isOwnedQuestionImagePath(storageObjectPath(CLASS_IMAGE), UID, "class", CLASS_ID)).toBe(true);
  });

  it("refuses another author's upload", () => {
    expect(isOwnedQuestionImagePath(storageObjectPath(CLASS_IMAGE), "someone-else", "class", CLASS_ID)).toBe(false);
  });

  it("refuses an image uploaded for a DIFFERENT class", () => {
    expect(isOwnedQuestionImagePath(storageObjectPath(CLASS_IMAGE), UID, "class", "class-2")).toBe(false);
  });

  it("refuses a private-shaped path on a class question, and the reverse", () => {
    expect(isOwnedQuestionImagePath(storageObjectPath(PRIVATE_IMAGE), UID, "class", CLASS_ID)).toBe(false);
    expect(isOwnedQuestionImagePath(storageObjectPath(CLASS_IMAGE), UID, "private", null)).toBe(false);
  });

  it("accepts the private and public shapes for their own surfaces", () => {
    expect(isOwnedQuestionImagePath(storageObjectPath(PRIVATE_IMAGE), UID, "private", null)).toBe(true);
    const pub = `https://x/v0/b/b/o/${encodeURIComponent(`questions/public/${UID}/y.jpg`)}?alt=media`;
    expect(isOwnedQuestionImagePath(storageObjectPath(pub), UID, "public", null)).toBe(true);
  });

  it("refuses a path outside questions/ entirely", () => {
    const avatar = `https://x/v0/b/b/o/${encodeURIComponent(`users/${UID}/avatar/a.jpg`)}?alt=media`;
    expect(isOwnedQuestionImagePath(storageObjectPath(avatar), UID, "private", null)).toBe(false);
  });
});

describe("submission identity", () => {
  it("accepts a well-formed operation id and refuses the rest", () => {
    expect(isValidOperationId("A".repeat(MIN_OPERATION_ID_LENGTH))).toBe(true);
    expect(isValidOperationId("a-b_C9".padEnd(MIN_OPERATION_ID_LENGTH, "x"))).toBe(true);
    expect(isValidOperationId("tooshort")).toBe(false);
    expect(isValidOperationId("A".repeat(MAX_OPERATION_ID_LENGTH + 1))).toBe(false);
    expect(isValidOperationId("has/slash".padEnd(20, "x"))).toBe(false);
    expect(isValidOperationId("has space".padEnd(20, "x"))).toBe(false);
    expect(isValidOperationId(12345)).toBe(false);
  });

  it("F21 the same submission always resolves to the same document", () => {
    expect(createdQuestionId(UID, "op-abcdefghijklmnop")).toBe(createdQuestionId(UID, "op-abcdefghijklmnop"));
  });

  it("F22 a different submission resolves to a different document", () => {
    expect(createdQuestionId(UID, "op-abcdefghijklmnop")).not.toBe(createdQuestionId(UID, "op-qrstuvwxyz123456"));
  });

  it("F23 two users sending the SAME operation id never collide", () => {
    // The key is derived from the authenticated uid as well, so one author can
    // neither overwrite nor observe another's create by guessing their id.
    expect(createdQuestionId("user-a", "shared-operation-id-1")).not.toBe(
      createdQuestionId("user-b", "shared-operation-id-1"),
    );
  });

  it("produces a plain Firestore-safe id", () => {
    const id = createdQuestionId(UID, "op-abcdefghijklmnop");
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("the canonical draft", () => {
  it("C1 accepts a complete teacher draft", () => {
    const draft = draftOf(classDraft());
    expect(draft.scope).toEqual({ subject: "Matematik", topic: "Denklemler", gradeLevel: "8" });
    expect(draft.authoring.choices).toEqual({ A: "x = 4", B: "x = -4", C: "x = 12" });
    expect(draft.authoring.correctChoice).toBe("A");
    expect(draft.imageUrl).toBe(CLASS_IMAGE);
  });

  it("C2 accepts an image-only question with no metadata and no choices", () => {
    // The one-tap capture. This must keep working.
    const draft = draftOf(buildQuestionCreateDraft({ imageUrl: CLASS_IMAGE }, UID, "class", CLASS_ID));
    expect(draft.scope).toEqual({ subject: "", topic: "", gradeLevel: "" });
    expect(draft.authoring.choices).toBeNull();
    expect(draft.authoring.correctChoice).toBeNull();
    expect(draft.authoring.description).toBeNull();
    expect(draft.authoring.hints).toEqual([]);
  });

  it("C7 accepts a question with no text, since the image carries it", () => {
    const draft = draftOf(classDraft({ description: "   " }));
    expect(draft.authoring.description).toBeNull();
  });

  it("C8 REJECTS options that sanitise away to nothing", () => {
    // Told apart from "no options at all" on purpose: the author sent options,
    // so storing this as an image-only question would lose their intent.
    expect(classDraft({ choices: { A: "tek şık" } })).toEqual({ rejection: "invalid-choices" });
  });

  it("C9 accepts two through five options", () => {
    expect(draftOf(classDraft({ choices: { A: "a", B: "b" }, correctChoice: "A" })).authoring.choices)
      .toEqual({ A: "a", B: "b" });
    const five = { A: "a", B: "b", C: "c", D: "d", E: "e" };
    expect(draftOf(classDraft({ choices: five, correctChoice: "E" })).authoring.correctChoice).toBe("E");
  });

  it("C10 rejects options with nothing marked correct", () => {
    expect(classDraft({ correctChoice: null })).toEqual({ rejection: "invalid-choices" });
  });

  it("C11 rejects a correct answer that is not one of the options", () => {
    expect(classDraft({ correctChoice: "E" })).toEqual({ rejection: "invalid-choices" });
  });

  it("C12 strips feedback from the correct answer rather than storing it", () => {
    const draft = draftOf(classDraft({
      choiceFeedback: { A: { text: "doğru şıkka not", semanticDefinitionId: "def-a" } },
    }));
    expect(draft.authoring.choiceFeedback).toBeNull();
  });

  it("C13 drops feedback for an option the question does not have", () => {
    const draft = draftOf(classDraft({
      choiceFeedback: { E: { text: "olmayan şık", semanticDefinitionId: "def-a" } },
    }));
    expect(draft.authoring.choiceFeedback).toBeNull();
  });

  it("C14 survives malformed feedback without storing nonsense", () => {
    const draft = draftOf(classDraft({
      choiceFeedback: { B: { text: 42 }, C: { text: "gerçek not", semanticDefinitionId: "a/b" } },
    }));
    expect(draft.authoring.choiceFeedback?.B).toBeUndefined();
    // A definition id containing "/" is refused; the note itself survives.
    expect(draft.authoring.choiceFeedback?.C?.semanticDefinitionId).toBeNull();
    expect(draft.authoring.choiceFeedback?.C?.text).toBe("gerçek not");
  });

  it("C15 bounds the hint ladder and drops blanks", () => {
    const draft = draftOf(classDraft({ hints: ["bir", "   ", "iki", "üç", "dört"] }));
    expect(draft.authoring.hints).toEqual(["bir", "iki", "üç"]);
  });

  it("C6 never reads a createdAt, a counter or an owner from the payload", () => {
    const draft = draftOf(classDraft({
      createdAt: 4102444800000, ownerId: "somebody-else", posterRole: "teacher",
      answerCount: 999, likeCount: 999, commentCount: 999, visibility: "public",
    }));
    // The draft type simply has nowhere to put any of them.
    expect(Object.keys(draft).sort()).toEqual(["authoring", "imagePath", "imageUrl", "scope"]);
  });

  it("rejects an image that is not this author's", () => {
    expect(classDraft({ imageUrl: "https://evil.test/x.png" })).toEqual({ rejection: "invalid-image" });
    expect(classDraft({ imageUrl: PRIVATE_IMAGE })).toEqual({ rejection: "invalid-image" });
  });

  it("rejects an out-of-taxonomy scope", () => {
    expect(classDraft({ subject: "Simya", topic: "" })).toEqual({ rejection: "invalid-scope" });
  });

  it("C22 is deterministic", () => {
    expect(draftOf(classDraft())).toEqual(draftOf(classDraft()));
  });
});

describe("C23 the taxonomy mirror has not drifted", () => {
  it("matches the client's subject, grade and topic lists exactly", async () => {
    const taxonomy = await import("../../src/features/questions/data/questionTaxonomy");
    const subjects = await import("../../src/features/classes/services/subjects");

    expect([...QUESTION_SUBJECTS]).toEqual([...subjects.CLASS_QUESTION_SUBJECTS]);
    expect([...QUESTION_SUBJECTS]).toEqual([...taxonomy.QUESTION_SUBJECTS]);
    expect([...GRADE_LEVELS]).toEqual([...taxonomy.GRADE_LEVELS]);

    // Every subject's topic list, including the fallback for uncurated ones.
    for (const subject of taxonomy.QUESTION_SUBJECTS) {
      expect([...topicsForSubject(subject)]).toEqual([...taxonomy.getTopicsForSubject(subject)]);
    }
    expect([...topicsForSubject("bilinmeyen ders")])
      .toEqual([...taxonomy.getTopicsForSubject("bilinmeyen ders")]);
  });
});
