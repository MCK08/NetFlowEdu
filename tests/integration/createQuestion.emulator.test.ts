// Phase 89 — the authoritative creation gateway, against a real Firestore.
//
// The guarantees here need real transaction semantics: that a retried
// submission cannot become a second question, that a refused create writes
// nothing at all, and that the author's standing is read from the class and
// membership documents at commit time rather than taken from a payload. A fake
// could only show the code calling itself.
//
// So this drives the SHIPPED handler. `applyQuestionCreate` is what the onCall
// wrapper delegates to, and it takes `db` as a parameter for exactly this
// reason — the pattern markAllNotificationsRead established and Phase 88
// reused. A passing test here is a passing production path.

import { deleteApp, initializeApp } from "../../functions/node_modules/firebase-admin/lib/app";
import { getFirestore } from "../../functions/node_modules/firebase-admin/lib/firestore";
import type { App } from "../../functions/node_modules/firebase-admin/lib/app";
import type { Firestore } from "../../functions/node_modules/firebase-admin/lib/firestore";

import { applyQuestionCreate } from "../../functions/src/questions/createQuestion";
import { createdQuestionId } from "../../functions/src/questions/questionCreate";

const PROJECT_ID = "netflow-edu-create-gateway-test";
const ORG = "org-1";
const CLASS_ID = "class-1";
const OTHER_CLASS = "class-2";
const TEACHER = "teacher-1";
const OTHER_TEACHER = "teacher-2";
const STUDENT = "student-1";
const OUTSIDER = "student-9";
const DEF_ACTIVE = "def-active";
const DEF_SECOND = "def-second";
const DEF_ARCHIVED = "def-archived";
const DEF_OTHER_SCOPE = "def-other-scope";
const DEF_OTHER_CLASS = "def-other-class";

const TEACHER_CLAIMS = { role: "teacher", organizationId: ORG };
const STUDENT_CLAIMS = { role: "student", organizationId: null };

let app: App;
let db: Firestore;

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  app = initializeApp({ projectId: PROJECT_ID }, `create-${Date.now()}`);
  db = getFirestore(app);

  for (const [cid, teacherId] of [[CLASS_ID, TEACHER], [OTHER_CLASS, OTHER_TEACHER]] as const) {
    await db.collection("classes").doc(cid).set({
      classId: cid, name: cid, teacherId, organizationId: ORG,
      subject: "Matematik", createdAt: 1, archived: false,
    });
  }
  await db.collection("classes").doc(CLASS_ID).collection("members").doc(STUDENT)
    .set({ uid: STUDENT, role: "student", joinedAt: 1, status: "active" });
  // A member whose record says "teacher" is still not the class's teacher.
  await db.collection("classes").doc(CLASS_ID).collection("members").doc(OTHER_TEACHER)
    .set({ uid: OTHER_TEACHER, role: "teacher", joinedAt: 1, status: "active" });

  const base = { classId: CLASS_ID, subject: "Matematik", topic: "Denklemler", createdBy: TEACHER, archived: false, schemaVersion: 1 };
  const defs = db.collection("classes").doc(CLASS_ID).collection("semanticDefinitions");
  await defs.doc(DEF_ACTIVE).set({ ...base, label: "İşaret aktarımı" });
  // Deliberately the SAME visible label as DEF_ACTIVE, different id.
  await defs.doc(DEF_SECOND).set({ ...base, label: "İşaret aktarımı" });
  await defs.doc(DEF_ARCHIVED).set({ ...base, label: "Arşivli", archived: true });
  await defs.doc(DEF_OTHER_SCOPE).set({ ...base, label: "Başka kapsam", topic: "Oranlar" });
  await db.collection("classes").doc(OTHER_CLASS).collection("semanticDefinitions").doc(DEF_OTHER_CLASS)
    .set({ ...base, classId: OTHER_CLASS, label: "Başka sınıf" });
});

afterAll(async () => {
  await deleteApp(app);
});

const imageFor = (uid: string, classId: string | null, visibility: string) =>
  `https://firebasestorage.googleapis.com/v0/b/b.appspot.com/o/${encodeURIComponent(
    visibility === "class"
      ? `questions/class/${ORG}/${classId}/${uid}/1.jpg`
      : `questions/${visibility}/${uid}/1.jpg`,
  )}?alt=media&token=t`;

let opSeq = 0;
const newOp = () => `operation-${Date.now()}-${++opSeq}`.padEnd(20, "x").slice(0, 48);

function classPayload(uid: string, over: Record<string, unknown> = {}) {
  return {
    operationId: newOp(),
    surface: "class",
    classId: CLASS_ID,
    imageUrl: imageFor(uid, CLASS_ID, "class"),
    subject: "Matematik",
    topic: "Denklemler",
    gradeLevel: "8",
    description: "3x + 4 = 16 denkleminde x kaçtır?",
    choices: { A: "x = 4", B: "x = -4", C: "x = 12" },
    correctChoice: "A",
    hints: ["Sabiti karşı tarafa geçir."],
    ...over,
  };
}

async function read(id: string): Promise<Record<string, unknown>> {
  return (await db.collection("questions").doc(id).get()).data() as Record<string, unknown>;
}

/** The shared mapping stored on one option, read through one helper so the
 *  assertions stay about the mapping rather than about casting. */
async function mappingOf(id: string, label = "B"): Promise<{ id: string | null; label: string | null }> {
  const feedback = (await read(id)).choiceFeedback as
    | Record<string, { semanticDefinitionId?: string | null; semanticLabel?: string | null } | undefined>
    | null
    | undefined;
  const entry = feedback?.[label];
  return { id: entry?.semanticDefinitionId ?? null, label: entry?.semanticLabel ?? null };
}

async function questionCount(): Promise<number> {
  return (await db.collection("questions").get()).size;
}

/** The refusal, including WHICH guard produced it. Several guards refuse with
 *  `invalid-argument`, so asserting only the code would let a test pass while
 *  the guard under test was missing entirely. */
async function failureOf(run: () => Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await run();
    return { code: "no-error", message: "the call was allowed to succeed" };
  } catch (error) {
    const e = error as { code?: string; message?: string };
    return { code: e.code ?? "unknown", message: e.message ?? "" };
  }
}

const feedback = (defId: string, label = "iddia edilen etiket", target = "B") => ({
  [target]: { text: "Bu şıkta işaret hatası var.", semanticDefinitionId: defId, semanticLabel: label },
});

describe("authentication and authorization", () => {
  it("F1 denies an unauthenticated caller, and writes nothing", async () => {
    const before = await questionCount();
    expect((await failureOf(() => applyQuestionCreate(db, undefined, TEACHER_CLAIMS, classPayload(TEACHER)))).code)
      .toBe("unauthenticated");
    expect(await questionCount()).toBe(before);
  });

  it("F2 lets the class's own teacher create", async () => {
    const result = await applyQuestionCreate(db, TEACHER, TEACHER_CLAIMS, classPayload(TEACHER));
    const stored = await read(result.questionId);
    expect(result.created).toBe(true);
    expect(stored.ownerId).toBe(TEACHER);
    expect(stored.posterRole).toBe("teacher");
    expect(stored.classId).toBe(CLASS_ID);
    expect(stored.visibility).toBe("class");
  });

  it("F3 lets a genuine student member create", async () => {
    const result = await applyQuestionCreate(db, STUDENT, STUDENT_CLAIMS, classPayload(STUDENT));
    const stored = await read(result.questionId);
    expect(stored.ownerId).toBe(STUDENT);
    expect(stored.posterRole).toBe("student");
    expect(stored.organizationId).toBe(ORG);
  });

  it("F4 denies someone who is not in the class at all", async () => {
    const before = await questionCount();
    const failure = await failureOf(() =>
      applyQuestionCreate(db, OUTSIDER, STUDENT_CLAIMS, classPayload(OUTSIDER)));
    expect(failure.code).toBe("permission-denied");
    expect(failure.message).toContain("yetkiniz yok");
    expect(await questionCount()).toBe(before);
  });

  it("refuses a create aimed at a different class than the image was uploaded for", async () => {
    // The image check fires first here, and that is the right order: the path
    // carries the class, so a mismatch is caught before any read happens.
    const failure = await failureOf(() =>
      applyQuestionCreate(db, TEACHER, TEACHER_CLAIMS, classPayload(TEACHER, { classId: OTHER_CLASS })));
    expect(failure.code).toBe("invalid-argument");
    expect(failure.message).toContain("görseli");
  });

  it("denies a class that does not exist", async () => {
    const before = await questionCount();
    const failure = await failureOf(() =>
      applyQuestionCreate(db, TEACHER, TEACHER_CLAIMS, classPayload(TEACHER, {
        classId: "no-such-class",
        // Matching image, so the class read is what actually decides.
        imageUrl: imageFor(TEACHER, "no-such-class", "class"),
      })));
    expect(failure.code).toBe("not-found");
    expect(failure.message).toContain("Sınıf bulunamadı");
    expect(await questionCount()).toBe(before);
  });

  it("F6 a member whose OWN record says 'teacher' is still not the class's teacher", async () => {
    // posterRole comes from the class's teacherId and the membership record,
    // never from a role the caller holds elsewhere — so a teacher of another
    // class posts here as what they actually are here, or not at all.
    const before = await questionCount();
    const failure = await failureOf(() =>
      applyQuestionCreate(db, OTHER_TEACHER, TEACHER_CLAIMS, classPayload(OTHER_TEACHER)));
    expect(failure.code).toBe("permission-denied");
    expect(await questionCount()).toBe(before);
  });
});

describe("server-owned fields", () => {
  it("F5/F7/F8 ignores a forged owner, role, createdAt and counters", async () => {
    const result = await applyQuestionCreate(db, STUDENT, STUDENT_CLAIMS, classPayload(STUDENT, {
      ownerId: TEACHER,
      posterRole: "teacher",
      visibility: "public",
      organizationId: "another-org",
      createdAt: 4102444800000,
      answerCount: 999, likeCount: 999, commentCount: 999,
      evilExtraField: "arbitrary",
    }));
    const stored = await read(result.questionId);
    expect(stored.ownerId).toBe(STUDENT);
    expect(stored.posterRole).toBe("student");
    expect(stored.visibility).toBe("class");
    expect(stored.organizationId).toBe(ORG);
    expect(stored.answerCount).toBe(0);
    expect(stored.likeCount).toBe(0);
    expect(stored.commentCount).toBe(0);
    expect(stored.evilExtraField).toBeUndefined();
  });

  it("F8 writes a server timestamp, not the client's date", async () => {
    const before = Date.now();
    const result = await applyQuestionCreate(db, TEACHER, TEACHER_CLAIMS, classPayload(TEACHER, {
      createdAt: 4102444800000,
    }));
    const stored = await read(result.questionId);
    const createdAt = (stored.createdAt as { toMillis(): number }).toMillis();
    expect(createdAt).toBeGreaterThanOrEqual(before - 60_000);
    expect(createdAt).toBeLessThan(before + 60_000);
  });

  it("stores the download URL, not the extracted path — readers render this field", async () => {
    const url = imageFor(TEACHER, CLASS_ID, "class");
    const result = await applyQuestionCreate(db, TEACHER, TEACHER_CLAIMS, classPayload(TEACHER, { imageUrl: url }));
    expect((await read(result.questionId)).imageUrl).toBe(url);
  });
});

describe("content validation", () => {
  it("F9 refuses malformed choices, and writes nothing", async () => {
    const before = await questionCount();
    for (const over of [
      { choices: { A: "tek" } },
      { correctChoice: "E" },
      { correctChoice: null },
    ]) {
      expect((await failureOf(() => applyQuestionCreate(db, TEACHER, TEACHER_CLAIMS, classPayload(TEACHER, over)))).code)
        .toBe("invalid-argument");
    }
    expect(await questionCount()).toBe(before);
  });

  it("F10 strips feedback attached to the correct answer", async () => {
    const result = await applyQuestionCreate(db, TEACHER, TEACHER_CLAIMS, classPayload(TEACHER, {
      choiceFeedback: feedback(DEF_ACTIVE, "İşaret aktarımı", "A"),
    }));
    expect((await read(result.questionId)).choiceFeedback).toBeNull();
  });

  it("F15/F16 bounds the hint ladder", async () => {
    const result = await applyQuestionCreate(db, TEACHER, TEACHER_CLAIMS, classPayload(TEACHER, {
      hints: ["bir", "  ", "iki", "üç", "dört", "x".repeat(500)],
    }));
    const hints = (await read(result.questionId)).hints as string[];
    expect(hints).toEqual(["bir", "iki", "üç"]);
  });

  it("refuses an out-of-taxonomy scope and an unowned image", async () => {
    const before = await questionCount();
    expect((await failureOf(() =>
      applyQuestionCreate(db, TEACHER, TEACHER_CLAIMS, classPayload(TEACHER, { subject: "Simya", topic: "" })))).message)
      .toContain("Ders, konu");
    expect((await failureOf(() =>
      applyQuestionCreate(db, TEACHER, TEACHER_CLAIMS, classPayload(TEACHER, { imageUrl: "https://evil.test/x.png" })))).message)
      .toContain("görseli");
    expect((await failureOf(() =>
      applyQuestionCreate(db, TEACHER, TEACHER_CLAIMS, classPayload(TEACHER, { imageUrl: imageFor(STUDENT, CLASS_ID, "class") })))).message)
      .toContain("görseli");
    expect(await questionCount()).toBe(before);
  });

  it("C2 accepts the one-tap image-only question with no metadata at all", async () => {
    const result = await applyQuestionCreate(db, TEACHER, TEACHER_CLAIMS, {
      operationId: newOp(), surface: "class", classId: CLASS_ID,
      imageUrl: imageFor(TEACHER, CLASS_ID, "class"),
    });
    const stored = await read(result.questionId);
    expect(stored.subject).toBe("");
    expect(stored.topic).toBe("");
    expect(stored.gradeLevel).toBe("");
    expect(stored.choices).toBeNull();
    expect(stored.description).toBeNull();
    expect(stored.posterRole).toBe("teacher");
  });

  it("creates a private question on the feed surface", async () => {
    const result = await applyQuestionCreate(db, STUDENT, STUDENT_CLAIMS, {
      operationId: newOp(), surface: "private", classId: null,
      imageUrl: imageFor(STUDENT, null, "private"),
      subject: "Fizik", topic: "Mekanik", gradeLevel: "9",
    });
    const stored = await read(result.questionId);
    expect(stored.visibility).toBe("private");
    expect(stored.classId).toBeNull();
    expect(stored.organizationId).toBeNull();
    expect(stored.posterRole).toBe("student");
  });
});

describe("semantic definition validation", () => {
  it("F11 accepts an active, in-class, in-scope definition", async () => {
    const result = await applyQuestionCreate(db, TEACHER, TEACHER_CLAIMS, classPayload(TEACHER, {
      choiceFeedback: feedback(DEF_ACTIVE),
    }));
    expect((await mappingOf(result.questionId)).id).toBe(DEF_ACTIVE);
  });

  it("takes the label from the DEFINITION, never from the payload", async () => {
    const result = await applyQuestionCreate(db, TEACHER, TEACHER_CLAIMS, classPayload(TEACHER, {
      choiceFeedback: feedback(DEF_ACTIVE, "TAMAMEN UYDURMA ETİKET"),
    }));
    expect((await mappingOf(result.questionId)).label).toBe("İşaret aktarımı");
  });

  it("F12 refuses an archived definition — every mapping on a new question is new", async () => {
    const before = await questionCount();
    const failure = await failureOf(() =>
      applyQuestionCreate(db, TEACHER, TEACHER_CLAIMS, classPayload(TEACHER, { choiceFeedback: feedback(DEF_ARCHIVED) })));
    expect(failure.code).toBe("invalid-argument");
    expect(failure.message).toContain("Arşivlenmiş");
    expect(await questionCount()).toBe(before);
  });

  it("F13 refuses another class's definition", async () => {
    const failure = await failureOf(() =>
      applyQuestionCreate(db, TEACHER, TEACHER_CLAIMS, classPayload(TEACHER, { choiceFeedback: feedback(DEF_OTHER_CLASS) })));
    expect(failure.code).toBe("invalid-argument");
    expect(failure.message).toContain("bulunamadı");
  });

  it("F14 refuses a definition from another subject/topic scope", async () => {
    const failure = await failureOf(() =>
      applyQuestionCreate(db, TEACHER, TEACHER_CLAIMS, classPayload(TEACHER, { choiceFeedback: feedback(DEF_OTHER_SCOPE) })));
    expect(failure.code).toBe("invalid-argument");
    expect(failure.message).toContain("kapsamına uymuyor");
  });

  it("refuses a definition that does not exist", async () => {
    const failure = await failureOf(() =>
      applyQuestionCreate(db, TEACHER, TEACHER_CLAIMS, classPayload(TEACHER, { choiceFeedback: feedback("no-such-def") })));
    expect(failure.message).toContain("bulunamadı");
  });

  it("C20 keeps two definitions with the SAME label apart by id", async () => {
    const first = await applyQuestionCreate(db, TEACHER, TEACHER_CLAIMS, classPayload(TEACHER, { choiceFeedback: feedback(DEF_ACTIVE) }));
    const second = await applyQuestionCreate(db, TEACHER, TEACHER_CLAIMS, classPayload(TEACHER, { choiceFeedback: feedback(DEF_SECOND) }));
    const a = await mappingOf(first.questionId);
    const b = await mappingOf(second.questionId);
    expect(a.id).toBe(DEF_ACTIVE);
    expect(b.id).toBe(DEF_SECOND);
    // Same visible name, two separate meanings. Identity never collapses to a label.
    expect(a.label).toBe(b.label);
    expect(a.label).toBe("İşaret aktarımı");
  });

  it("refuses a shared mapping on a question with no class to own it", async () => {
    const failure = await failureOf(() => applyQuestionCreate(db, STUDENT, STUDENT_CLAIMS, {
      operationId: newOp(), surface: "private", classId: null,
      imageUrl: imageFor(STUDENT, null, "private"),
      subject: "Matematik", topic: "Denklemler",
      choices: { A: "a", B: "b" }, correctChoice: "A",
      choiceFeedback: feedback(DEF_ACTIVE),
    }));
    expect(failure.message).toContain("yalnızca sınıf sorularında");
  });
});

describe("idempotency", () => {
  it("F17/F21 the same submission retried creates exactly one question", async () => {
    const payload = classPayload(TEACHER);
    const before = await questionCount();
    const first = await applyQuestionCreate(db, TEACHER, TEACHER_CLAIMS, payload);
    const second = await applyQuestionCreate(db, TEACHER, TEACHER_CLAIMS, payload);
    const third = await applyQuestionCreate(db, TEACHER, TEACHER_CLAIMS, payload);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(third.created).toBe(false);
    expect(second.questionId).toBe(first.questionId);
    expect(await questionCount()).toBe(before + 1);
  });

  it("a retry does not overwrite what the first call stored", async () => {
    const payload = classPayload(TEACHER, { description: "ilk hali" });
    const first = await applyQuestionCreate(db, TEACHER, TEACHER_CLAIMS, payload);
    // The same submission id, but different content — a replay must not become
    // an edit. Revision is the Phase 88 gateway's job, not this one's.
    await applyQuestionCreate(db, TEACHER, TEACHER_CLAIMS, { ...payload, description: "sonradan değişti" });
    expect((await read(first.questionId)).description).toBe("ilk hali");
  });

  it("F22 the same content under a NEW submission id is a second, intentional question", async () => {
    const base = classPayload(TEACHER, { description: "kasıtlı kopya" });
    const first = await applyQuestionCreate(db, TEACHER, TEACHER_CLAIMS, base);
    const second = await applyQuestionCreate(db, TEACHER, TEACHER_CLAIMS, { ...base, operationId: newOp() });
    expect(second.questionId).not.toBe(first.questionId);
    expect(second.created).toBe(true);
  });

  it("F23 another author reusing the same submission id gets their own question", async () => {
    const operationId = newOp();
    const t = await applyQuestionCreate(db, TEACHER, TEACHER_CLAIMS, classPayload(TEACHER, { operationId }));
    const s = await applyQuestionCreate(db, STUDENT, STUDENT_CLAIMS, classPayload(STUDENT, { operationId }));
    expect(s.questionId).not.toBe(t.questionId);
    expect(s.created).toBe(true);
    expect((await read(t.questionId)).ownerId).toBe(TEACHER);
    expect((await read(s.questionId)).ownerId).toBe(STUDENT);
    expect(t.questionId).toBe(createdQuestionId(TEACHER, operationId));
  });

  it("refuses a malformed submission id", async () => {
    const before = await questionCount();
    for (const operationId of ["short", "has/slash-aaaaaaaaaaaa", "", undefined]) {
      expect((await failureOf(() =>
        applyQuestionCreate(db, TEACHER, TEACHER_CLAIMS, classPayload(TEACHER, { operationId })))).code)
        .toBe("invalid-argument");
    }
    expect(await questionCount()).toBe(before);
  });

  it("two simultaneous identical submissions still produce one question", async () => {
    const payload = classPayload(TEACHER);
    const before = await questionCount();
    const [a, b] = await Promise.all([
      applyQuestionCreate(db, TEACHER, TEACHER_CLAIMS, payload),
      applyQuestionCreate(db, TEACHER, TEACHER_CLAIMS, payload),
    ]);
    expect(a.questionId).toBe(b.questionId);
    expect(await questionCount()).toBe(before + 1);
  });
});

describe("blast radius", () => {
  it("F17 one successful create writes exactly one question document", async () => {
    const before = await questionCount();
    await applyQuestionCreate(db, TEACHER, TEACHER_CLAIMS, classPayload(TEACHER));
    expect(await questionCount()).toBe(before + 1);
  });

  it("never writes to studyEvents, classes or semanticDefinitions", async () => {
    const defRef = db.collection("classes").doc(CLASS_ID).collection("semanticDefinitions").doc(DEF_ACTIVE);
    const classRef = db.collection("classes").doc(CLASS_ID);
    const defBefore = (await defRef.get()).updateTime!.toMillis();
    const classBefore = (await classRef.get()).updateTime!.toMillis();
    await db.collection("users").doc(STUDENT).collection("studyEvents").doc("e1").set({ occurredAt: 1 });
    const eventBefore = (await db.collection("users").doc(STUDENT).collection("studyEvents").doc("e1").get())
      .updateTime!.toMillis();

    await applyQuestionCreate(db, TEACHER, TEACHER_CLAIMS, classPayload(TEACHER, {
      choiceFeedback: feedback(DEF_ACTIVE),
    }));

    expect((await defRef.get()).updateTime!.toMillis()).toBe(defBefore);
    expect((await classRef.get()).updateTime!.toMillis()).toBe(classBefore);
    expect((await db.collection("users").doc(STUDENT).collection("studyEvents").doc("e1").get())
      .updateTime!.toMillis()).toBe(eventBefore);
  });
});
