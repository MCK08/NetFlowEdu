// Phase 88 — the authoritative revision gateway, against a real Firestore.
//
// The guarantees this file exists to prove — atomic compare-and-set, owner
// enforcement, server-side sanitisation, semantic-scope validation, and "a
// refused call writes nothing" — all depend on real Firestore transaction
// semantics. A fake could only demonstrate that the code calls itself.
//
// So it drives the SHIPPED handler: `applyQuestionRevision` is the same
// function the onCall wrapper delegates to, and it takes `db` as a parameter
// for precisely this reason (the pattern markAllNotificationsRead established).
// A passing test here is a passing production path.

import { deleteApp, initializeApp } from "../../functions/node_modules/firebase-admin/lib/app";
import { getFirestore } from "../../functions/node_modules/firebase-admin/lib/firestore";
import type { App } from "../../functions/node_modules/firebase-admin/lib/app";
import type { Firestore } from "../../functions/node_modules/firebase-admin/lib/firestore";

import {
  applyQuestionRevision,
  REVISION_CONFLICT_REASON,
} from "../../functions/src/questions/updateQuestionRevision";
import { questionAuthoringRevision } from "../../functions/src/questions/questionRevision";

const PROJECT_ID = "netflow-edu-revision-gateway-test";
const OWNER = "teacher-1";
const OTHER_TEACHER = "teacher-2";
const STUDENT = "student-1";
const OUTSIDER = "student-9";
const CLASS_ID = "class-1";
const DEF_A = "def-a";
const DEF_B = "def-b";
const DEF_ARCHIVED = "def-archived";
const DEF_OTHER_SCOPE = "def-other-scope";

let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  app = initializeApp({ projectId: PROJECT_ID }, `revision-${Date.now()}`);
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

const FB = "Eşitliğin diğer tarafına geçerken işaret değişir.";

function questionDoc(over: Record<string, unknown> = {}) {
  return {
    ownerId: OWNER,
    classId: CLASS_ID,
    organizationId: "org-1",
    visibility: "class",
    posterRole: "teacher",
    subject: "Matematik",
    topic: "Denklemler",
    gradeLevel: "8",
    description: "3x + 4 = 16 denkleminde x kaçtır?",
    imageUrl: null,
    questionType: "multiple_choice",
    choices: { A: "x = 4", B: "x = -4", C: "x = 12" },
    correctChoice: "A",
    choiceFeedback: { B: { text: FB, semanticDefinitionId: DEF_A, semanticLabel: "İşaret aktarımı" } },
    hints: ["Sabiti karşı tarafa geçir."],
    createdAt: 1,
    likeCount: 0,
    commentCount: 0,
    answerCount: 0,
    ...over,
  };
}

/** A payload shaped exactly as the client sends one. */
function revisionPayload(over: Record<string, unknown> = {}) {
  return {
    description: "3x + 4 = 16 denkleminde x kaçtır?",
    choices: { A: "x = 4", B: "x = -4", C: "x = 12" },
    correctChoice: "A",
    choiceFeedback: { B: { text: FB, semanticDefinitionId: DEF_A, semanticLabel: "İşaret aktarımı" } },
    hints: ["Sabiti karşı tarafa geçir."],
    ...over,
  };
}

async function definition(id: string, over: Record<string, unknown> = {}) {
  await db
    .collection("classes").doc(CLASS_ID)
    .collection("semanticDefinitions").doc(id)
    .set({
      classId: CLASS_ID,
      label: "İşaret aktarımı",
      subject: "Matematik",
      topic: "Denklemler",
      createdBy: OWNER,
      archived: false,
      schemaVersion: 1,
      ...over,
    });
}

let seq = 0;
/** A fresh question per test, so nothing leaks between them. */
async function seed(over: Record<string, unknown> = {}): Promise<{ id: string; revision: string }> {
  const id = `q-${++seq}-${Date.now()}`;
  const doc = questionDoc(over);
  await db.collection("questions").doc(id).set(doc);
  return { id, revision: questionAuthoringRevision(doc as Record<string, unknown>) };
}

async function read(id: string): Promise<Record<string, unknown>> {
  return (await db.collection("questions").doc(id).get()).data() as Record<string, unknown>;
}

/** The shared-definition id stored on one option, or null when that option
 *  carries no note at all. Going through one helper keeps the assertions about
 *  the mapping rather than about casting. */
async function mappingOf(id: string, label: string): Promise<string | null> {
  const feedback = (await read(id)).choiceFeedback as
    | Record<string, { semanticDefinitionId?: string | null } | undefined>
    | null
    | undefined;
  return feedback?.[label]?.semanticDefinitionId ?? null;
}

async function writeTimeOf(id: string): Promise<number> {
  return (await db.collection("questions").doc(id).get()).updateTime!.toMillis();
}

/** The refusal the handler threw, including WHICH guard produced it.
 *
 *  The message matters as much as the code. Several distinct guards refuse with
 *  `invalid-argument`, and a test that asserted only the code would pass if a
 *  completely different check happened to fire first — proving the call was
 *  refused, but not that the guard under test exists. Pinning the message pins
 *  provenance. `reason` is asserted too because the client's error mapping
 *  discriminates a stale draft from a flat refusal on that marker alone. */
async function failureOf(
  run: () => Promise<unknown>,
): Promise<{ code: string; message: string; reason?: string }> {
  try {
    await run();
    return { code: "no-error", message: "the call was allowed to succeed" };
  } catch (error) {
    const e = error as { code?: string; message?: string; details?: { reason?: string } };
    return { code: e.code ?? "unknown", message: e.message ?? "", reason: e.details?.reason };
  }
}

/** For the cases where only the refusal itself is the point. */
async function codeOf(run: () => Promise<unknown>): Promise<string> {
  return (await failureOf(run)).code;
}

beforeAll(async () => {
  await definition(DEF_A);
  await definition(DEF_B, { label: "Negatif işaret aktarımı" });
  await definition(DEF_ARCHIVED, { label: "Arşivli", archived: true });
  await definition(DEF_OTHER_SCOPE, { label: "Başka kapsam", topic: "Oranlar" });
});

describe("authentication and authorization", () => {
  it("F1 denies an unauthenticated caller", async () => {
    const { id, revision } = await seed();
    expect(await codeOf(() => applyQuestionRevision(db, undefined, {
      questionId: id, expectedRevision: revision, revision: revisionPayload(),
    }))).toBe("unauthenticated");
  });

  it("F2 allows the owner with a matching revision", async () => {
    const { id, revision } = await seed();
    const result = await applyQuestionRevision(db, OWNER, {
      questionId: id, expectedRevision: revision,
      revision: revisionPayload({ description: "Sahibi güncelledi" }),
    });
    expect((await read(id)).description).toBe("Sahibi güncelledi");
    expect(result.revision).toBe(questionAuthoringRevision(await read(id)));
  });

  it("F4 denies a teacher who is not the owner", async () => {
    const { id, revision } = await seed();
    // Everything except the caller is identical to F2, which succeeds. That
    // pairing is what proves the ownership check is load-bearing rather than
    // decorative: one variable changed, refusal instead of a write.
    const failure = await failureOf(() => applyQuestionRevision(db, OTHER_TEACHER, {
      questionId: id, expectedRevision: revision, revision: revisionPayload({ description: "Başka öğretmen" }),
    }));
    expect(failure.code).toBe("permission-denied");
    expect(failure.message).toContain("yalnızca yazarı");
    expect((await read(id)).description).toBe("3x + 4 = 16 denkleminde x kaçtır?");
  });

  it("F4 denies the class teacher on a STUDENT-authored question", async () => {
    // Owning the classroom is not owning its authors' work.
    const { id, revision } = await seed({ ownerId: STUDENT, posterRole: "student" });
    expect(await codeOf(() => applyQuestionRevision(db, OWNER, {
      questionId: id, expectedRevision: revision, revision: revisionPayload({ description: "Öğretmen" }),
    }))).toBe("permission-denied");
  });

  it("F5 allows a STUDENT owner on their own question", async () => {
    const { id, revision } = await seed({ ownerId: STUDENT, posterRole: "student" });
    await applyQuestionRevision(db, STUDENT, {
      questionId: id, expectedRevision: revision, revision: revisionPayload({ description: "Öğrenci kendi sorusu" }),
    });
    expect((await read(id)).description).toBe("Öğrenci kendi sorusu");
  });

  it("F6 denies an outsider", async () => {
    const { id, revision } = await seed();
    expect(await codeOf(() => applyQuestionRevision(db, OUTSIDER, {
      questionId: id, expectedRevision: revision, revision: revisionPayload(),
    }))).toBe("permission-denied");
  });

  it("denies a missing question", async () => {
    expect(await codeOf(() => applyQuestionRevision(db, OWNER, {
      questionId: "does-not-exist", expectedRevision: "x", revision: revisionPayload(),
    }))).toBe("not-found");
  });
});

describe("optimistic concurrency", () => {
  it("F3 rejects a stale revision, and says so in the way the client reads", async () => {
    const { id, revision } = await seed();
    await applyQuestionRevision(db, OWNER, {
      questionId: id, expectedRevision: revision, revision: revisionPayload({ description: "A oturumu" }),
    });
    const failure = await failureOf(() => applyQuestionRevision(db, OWNER, {
      questionId: id, expectedRevision: revision, revision: revisionPayload({ description: "B bayat" }),
    }));
    expect(failure.code).toBe("failed-precondition");
    // The client maps a conflict on this marker, not on the code or the prose,
    // so the marker is part of the contract and is asserted as one.
    expect(failure.reason).toBe(REVISION_CONFLICT_REASON);
    expect((await read(id)).description).toBe("A oturumu");
  });

  it("F17 a stale call writes nothing", async () => {
    const { id, revision } = await seed();
    await applyQuestionRevision(db, OWNER, {
      questionId: id, expectedRevision: revision, revision: revisionPayload({ description: "ilk" }),
    });
    const before = await writeTimeOf(id);
    await codeOf(() => applyQuestionRevision(db, OWNER, {
      questionId: id, expectedRevision: revision, revision: revisionPayload({ description: "bayat" }),
    }));
    expect(await writeTimeOf(id)).toBe(before);
  });

  it("F32 a replayed identical call with the old revision conflicts rather than applying twice", async () => {
    // Compare-and-set, not an additive operation: the retry must not land.
    const { id, revision } = await seed();
    const payload = revisionPayload({ description: "bir kez" });
    await applyQuestionRevision(db, OWNER, { questionId: id, expectedRevision: revision, revision: payload });
    const after = await writeTimeOf(id);
    expect(await codeOf(() => applyQuestionRevision(db, OWNER, {
      questionId: id, expectedRevision: revision, revision: payload,
    }))).toBe("failed-precondition");
    expect(await writeTimeOf(id)).toBe(after);
  });

  it("accepts the refreshed revision the previous call returned", async () => {
    const { id, revision } = await seed();
    const first = await applyQuestionRevision(db, OWNER, {
      questionId: id, expectedRevision: revision, revision: revisionPayload({ description: "bir" }),
    });
    await applyQuestionRevision(db, OWNER, {
      questionId: id, expectedRevision: first.revision, revision: revisionPayload({ description: "iki" }),
    });
    expect((await read(id)).description).toBe("iki");
  });

  it("a counter moving is NOT a conflict, and the counter survives", async () => {
    const { id, revision } = await seed();
    // Exactly how the trusted counter Functions write it.
    await db.collection("questions").doc(id).update({ answerCount: 7 });
    await applyQuestionRevision(db, OWNER, {
      questionId: id, expectedRevision: revision, revision: revisionPayload({ description: "sayaçtan sonra" }),
    });
    const after = await read(id);
    expect(after.description).toBe("sayaçtan sonra");
    expect(after.answerCount).toBe(7);
  });
});

describe("payload safety", () => {
  it("F7 rejects a malformed payload", async () => {
    const { id, revision } = await seed();
    expect(await codeOf(() => applyQuestionRevision(db, OWNER, {
      questionId: id, expectedRevision: revision, revision: "not an object",
    }))).toBe("invalid-argument");
    expect(await codeOf(() => applyQuestionRevision(db, OWNER, {
      questionId: id, expectedRevision: revision, revision: { choices: { A: "tek" }, correctChoice: "A" },
    }))).toBe("invalid-argument");
  });

  it("rejects a missing or empty expectedRevision", async () => {
    const { id } = await seed();
    expect(await codeOf(() => applyQuestionRevision(db, OWNER, {
      questionId: id, revision: revisionPayload(),
    }))).toBe("invalid-argument");
  });

  it("F8/F9/F10 never writes a forged ownerId, classId, visibility or counter", async () => {
    const { id, revision } = await seed();
    await applyQuestionRevision(db, OWNER, {
      questionId: id,
      expectedRevision: revision,
      revision: {
        ...revisionPayload({ description: "sahte alanlarla" }),
        ownerId: OUTSIDER,
        classId: "class-999",
        visibility: "public",
        posterRole: "student",
        answerCount: 9999,
        likeCount: 9999,
        commentCount: 9999,
        subject: "Fizik",
        imageUrl: "https://evil.test/x.png",
      } as Record<string, unknown>,
    });
    const after = await read(id);
    expect(after.description).toBe("sahte alanlarla");
    expect(after.ownerId).toBe(OWNER);
    expect(after.classId).toBe(CLASS_ID);
    expect(after.visibility).toBe("class");
    expect(after.posterRole).toBe("teacher");
    expect(after.answerCount).toBe(0);
    expect(after.likeCount).toBe(0);
    expect(after.commentCount).toBe(0);
    expect(after.subject).toBe("Matematik");
    expect(after.imageUrl).toBeNull();
  });

  it("F11 strips a note and mapping from a choice that becomes the correct answer", async () => {
    const { id, revision } = await seed();
    await applyQuestionRevision(db, OWNER, {
      questionId: id,
      expectedRevision: revision,
      revision: revisionPayload({ correctChoice: "B" }),
    });
    const after = await read(id);
    expect(after.correctChoice).toBe("B");
    expect((after.choiceFeedback as Record<string, unknown> | null)).toBeNull();
  });

  it("F12 drops a blank note and a note on an absent option", async () => {
    const { id, revision } = await seed();
    await applyQuestionRevision(db, OWNER, {
      questionId: id,
      expectedRevision: revision,
      revision: revisionPayload({
        choiceFeedback: {
          B: { text: "   ", semanticDefinitionId: DEF_A },
          E: { text: "olmayan şık", semanticDefinitionId: DEF_A },
        },
      }),
    });
    expect((await read(id)).choiceFeedback).toBeNull();
  });

  it("F13 caps hints at the ladder length and drops blanks", async () => {
    const { id, revision } = await seed();
    await applyQuestionRevision(db, OWNER, {
      questionId: id,
      expectedRevision: revision,
      revision: revisionPayload({ hints: ["bir", "  ", "iki", "üç", "dört"] }),
    });
    expect((await read(id)).hints).toEqual(["bir", "iki", "üç"]);
  });
});

describe("semantic definition validation", () => {
  it("F14 accepts a remap to an active, in-scope definition", async () => {
    const { id, revision } = await seed();
    await applyQuestionRevision(db, OWNER, {
      questionId: id,
      expectedRevision: revision,
      revision: revisionPayload({
        choiceFeedback: { B: { text: FB, semanticDefinitionId: DEF_B, semanticLabel: "Negatif" } },
      }),
    });
    expect(await mappingOf(id, "B")).toBe(DEF_B);
  });

  it("F15 leaves an ALREADY-PRESENT archived mapping alone during an unrelated edit", async () => {
    // Archiving retires a definition from new selection; it does not invalidate
    // the questions already pointing at it.
    const { id, revision } = await seed({
      choiceFeedback: { B: { text: FB, semanticDefinitionId: DEF_ARCHIVED, semanticLabel: "Arşivli" } },
    });
    await applyQuestionRevision(db, OWNER, {
      questionId: id,
      expectedRevision: revision,
      revision: revisionPayload({
        description: "alakasız düzenleme",
        choiceFeedback: { B: { text: FB, semanticDefinitionId: DEF_ARCHIVED, semanticLabel: "Arşivli" } },
      }),
    });
    const after = await read(id);
    expect(after.description).toBe("alakasız düzenleme");
    expect(await mappingOf(id, "B")).toBe(DEF_ARCHIVED);
  });

  // These three all refuse with `invalid-argument`, so each asserts its own
  // message. Otherwise any one of them would pass while the other two guards
  // were missing entirely.

  it("F16 refuses a NEW mapping to an archived definition", async () => {
    const { id, revision } = await seed();
    const failure = await failureOf(() => applyQuestionRevision(db, OWNER, {
      questionId: id,
      expectedRevision: revision,
      revision: revisionPayload({
        choiceFeedback: { B: { text: FB, semanticDefinitionId: DEF_ARCHIVED } },
      }),
    }));
    expect(failure.code).toBe("invalid-argument");
    expect(failure.message).toContain("Arşivlenmiş");
    // The refusal is total: the question keeps the mapping it already had.
    expect(await mappingOf(id, "B")).toBe(DEF_A);
  });

  it("refuses a definition from another subject/topic scope", async () => {
    const { id, revision } = await seed();
    const failure = await failureOf(() => applyQuestionRevision(db, OWNER, {
      questionId: id,
      expectedRevision: revision,
      revision: revisionPayload({
        choiceFeedback: { B: { text: FB, semanticDefinitionId: DEF_OTHER_SCOPE } },
      }),
    }));
    expect(failure.code).toBe("invalid-argument");
    expect(failure.message).toContain("kapsamına uymuyor");
  });

  it("refuses a definition that does not exist", async () => {
    const { id, revision } = await seed();
    const failure = await failureOf(() => applyQuestionRevision(db, OWNER, {
      questionId: id,
      expectedRevision: revision,
      revision: revisionPayload({
        choiceFeedback: { B: { text: FB, semanticDefinitionId: "no-such-definition" } },
      }),
    }));
    expect(failure.code).toBe("invalid-argument");
    expect(failure.message).toContain("bulunamadı");
  });
});

describe("blast radius", () => {
  it("F18 a successful revision writes exactly the one question document", async () => {
    const { id, revision } = await seed();
    const otherSeed = await seed();
    const otherBefore = await writeTimeOf(otherSeed.id);
    await applyQuestionRevision(db, OWNER, {
      questionId: id, expectedRevision: revision, revision: revisionPayload({ description: "tek yazma" }),
    });
    expect(await writeTimeOf(otherSeed.id)).toBe(otherBefore);
  });

  it("F19/F20 never touches studyEvents or semanticDefinitions", async () => {
    const { id, revision } = await seed();
    await db.collection("users").doc(STUDENT).collection("studyEvents").doc("e1")
      .set({ questionId: id, occurredAt: 1, outcome: "struggled" });
    const eventBefore = (await db.collection("users").doc(STUDENT).collection("studyEvents").doc("e1").get())
      .updateTime!.toMillis();
    const defRef = db.collection("classes").doc(CLASS_ID).collection("semanticDefinitions").doc(DEF_A);
    const defBefore = (await defRef.get()).updateTime!.toMillis();

    await applyQuestionRevision(db, OWNER, {
      questionId: id,
      expectedRevision: revision,
      revision: revisionPayload({
        description: "geçmişe dokunmaz",
        choiceFeedback: { B: { text: FB, semanticDefinitionId: DEF_B, semanticLabel: "Negatif" } },
      }),
    });

    expect((await db.collection("users").doc(STUDENT).collection("studyEvents").doc("e1").get())
      .updateTime!.toMillis()).toBe(eventBefore);
    expect((await defRef.get()).updateTime!.toMillis()).toBe(defBefore);
  });
});
