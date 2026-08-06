// The publication gate, driven through the REAL callable handler against a
// strict Firestore fake.
//
// The fake throws on any read issued after the first write — the same
// assertion the Phase 15 fakes gained after an in-memory fake that did NOT
// model that ordering let 882 green tests coexist with a production outage.
// Reusing that behaviour here is the point: this function does four reads
// and three writes inside one transaction.

type DocData = Record<string, unknown>;

interface FakeDoc {
  data: DocData | null;
}

const store = new Map<string, FakeDoc>();
let generatedIds = 0;

function keyFor(path: string[]): string {
  return path.join("/");
}

function docRef(path: string[]) {
  const key = keyFor(path);
  return {
    id: path[path.length - 1],
    _key: key,
    get() {
      const entry = store.get(key);
      return {
        exists: entry?.data != null,
        data: () => entry?.data ?? undefined,
      };
    },
    set(data: DocData, options?: { merge?: boolean }) {
      const previous = store.get(key)?.data ?? null;
      store.set(key, { data: options?.merge && previous ? { ...previous, ...data } : data });
    },
  };
}

function collectionRef(path: string[]) {
  return {
    doc(id?: string) {
      const resolved = id ?? `generated-${++generatedIds}`;
      return {
        ...docRef([...path, resolved]),
        collection: (name: string) => collectionRef([...path, resolved, name]),
      };
    },
  };
}

let readAfterWriteDetected = false;

const fakeDb = {
  collection(name: string) {
    return collectionRef([name]);
  },
  async runTransaction(fn: (tx: unknown) => Promise<unknown>) {
    let hasWritten = false;
    const assertReadPhase = () => {
      if (hasWritten) {
        readAfterWriteDetected = true;
        throw new Error(
          "Firestore transactions require all reads to be executed before all writes.",
        );
      }
    };
    const tx = {
      get: (ref: { get: () => unknown }) => {
        assertReadPhase();
        return ref.get();
      },
      set: (ref: { set: (d: DocData, o?: { merge?: boolean }) => void }, data: DocData, options?: { merge?: boolean }) => {
        hasWritten = true;
        ref.set(data, options);
      },
    };
    return fn(tx);
  },
};

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: () => fakeDb,
}));

jest.mock("firebase-functions/v2/https", () => {
  class FakeHttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    HttpsError: FakeHttpsError,
    onCall: (_opts: unknown, handler: unknown) => handler,
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { submitQuestionCommentForModeration } = require("../../functions/src/moderation/submitQuestionComment");

type Handler = (req: {
  auth?: { uid: string; token: Record<string, unknown> };
  data: Record<string, unknown>;
}) => Promise<{ submissionId: string; status: string; publishedEntityId: string | null }>;

const submit = submitQuestionCommentForModeration as unknown as Handler;

const STUDENT = "student-uid";
const OP = "op-abcdefgh";

function seedPublicQuestion(id = "q1") {
  store.set(`questions/${id}`, {
    data: { ownerId: "teacher-uid", visibility: "public", organizationId: "org1", classId: null },
  });
}

function call(data: Record<string, unknown>, uid = STUDENT) {
  return submit({ auth: { uid, token: { role: "student" } }, data });
}

function commentDocs(): [string, FakeDoc][] {
  return [...store.entries()].filter(([key]) => key.startsWith("questionComments/"));
}

beforeEach(() => {
  store.clear();
  generatedIds = 0;
  readAfterWriteDetected = false;
});

describe("submitQuestionCommentForModeration — authorization", () => {
  it("rejects an unauthenticated caller", async () => {
    seedPublicQuestion();
    await expect(
      submit({ data: { questionId: "q1", text: "merhaba", operationId: OP } }),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("rejects a missing question", async () => {
    await expect(call({ questionId: "nope", text: "merhaba", operationId: OP })).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("denies a private question the caller does not own", async () => {
    store.set("questions/q1", {
      data: { ownerId: "someone-else", visibility: "private", organizationId: "org1", classId: null },
    });
    await expect(call({ questionId: "q1", text: "merhaba", operationId: OP })).rejects.toMatchObject({
      code: "permission-denied",
    });
    expect(commentDocs()).toHaveLength(0);
  });

  it("denies a class question when the caller is not a member", async () => {
    store.set("questions/q1", {
      data: { ownerId: "teacher-uid", visibility: "class", organizationId: "org1", classId: "c1" },
    });
    await expect(call({ questionId: "q1", text: "merhaba", operationId: OP })).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it("allows a class member", async () => {
    store.set("questions/q1", {
      data: { ownerId: "teacher-uid", visibility: "class", organizationId: "org1", classId: "c1" },
    });
    store.set(`classes/c1/members/${STUDENT}`, { data: { role: "student" } });
    const result = await call({ questionId: "q1", text: "merhaba", operationId: OP });
    expect(result.status).toBe("published");
  });
});

describe("submitQuestionCommentForModeration — input validation", () => {
  beforeEach(seedPublicQuestion);

  it("rejects an empty text", async () => {
    await expect(call({ questionId: "q1", text: "   ", operationId: OP })).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("rejects text over the length limit", async () => {
    await expect(
      call({ questionId: "q1", text: "a".repeat(501), operationId: OP }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects a malformed operationId rather than ignoring it", async () => {
    // Silently accepting it would silently drop the replay protection.
    await expect(call({ questionId: "q1", text: "merhaba", operationId: "short" })).rejects.toMatchObject({
      code: "invalid-argument",
    });
    await expect(call({ questionId: "q1", text: "merhaba", operationId: "has spaces!!" })).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });
});

describe("submitQuestionCommentForModeration — publication gate", () => {
  beforeEach(seedPublicQuestion);

  it("publishes exactly one comment for clean text", async () => {
    const result = await call({ questionId: "q1", text: "Bu soruyu nasıl çözdün?", operationId: OP });
    expect(result.status).toBe("published");
    expect(result.publishedEntityId).not.toBeNull();
    expect(commentDocs()).toHaveLength(1);
  });

  it("creates NO comment for text the deterministic layer refuses", async () => {
    const result = await call({ questionId: "q1", text: "siktir git", operationId: OP });
    expect(result.status).toBe("not_published");
    expect(result.publishedEntityId).toBeNull();
    // The whole point: no document, so no counter and no notification.
    expect(commentDocs()).toHaveLength(0);
  });

  it("creates NO comment for content routed to manual review", async () => {
    const result = await call({ questionId: "q1", text: "bana yaz 0532 111 22 33", operationId: OP });
    expect(result.status).toBe("in_review");
    expect(result.publishedEntityId).toBeNull();
    expect(commentDocs()).toHaveLength(0);
  });

  it("records a submission even when nothing is published", async () => {
    // Rejected content still leaves an auditable trail.
    await call({ questionId: "q1", text: "siktir", operationId: OP });
    const submission = store.get(`moderationSubmissions/${STUDENT}_${OP}`);
    expect(submission?.data?.status).toBe("rejected");
    expect(submission?.data?.publishedEntityId).toBeNull();
    expect(submission?.data?.authorId).toBe(STUDENT);
  });

  it("never lets the client choose the status", async () => {
    // A client-supplied status field must be ignored entirely.
    await call({ questionId: "q1", text: "siktir", operationId: OP, status: "approved" });
    expect(store.get(`moderationSubmissions/${STUDENT}_${OP}`)?.data?.status).toBe("rejected");
    expect(commentDocs()).toHaveLength(0);
  });
});

describe("submitQuestionCommentForModeration — idempotency", () => {
  beforeEach(seedPublicQuestion);

  it("does not publish twice for the same operationId", async () => {
    const first = await call({ questionId: "q1", text: "merhaba", operationId: OP });
    const second = await call({ questionId: "q1", text: "merhaba", operationId: OP });
    expect(commentDocs()).toHaveLength(1);
    expect(second.publishedEntityId).toBe(first.publishedEntityId);
    expect(second.status).toBe("published");
  });

  it("keeps publishedEntityId stable across replays", async () => {
    const first = await call({ questionId: "q1", text: "merhaba", operationId: OP });
    for (let i = 0; i < 5; i += 1) {
      const replay = await call({ questionId: "q1", text: "merhaba", operationId: OP });
      expect(replay.publishedEntityId).toBe(first.publishedEntityId);
    }
    expect(commentDocs()).toHaveLength(1);
  });

  it("does not resurrect a rejected submission on replay", async () => {
    await call({ questionId: "q1", text: "siktir", operationId: OP });
    const replay = await call({ questionId: "q1", text: "siktir", operationId: OP });
    expect(replay.status).toBe("not_published");
    expect(commentDocs()).toHaveLength(0);
  });

  it("treats a different operationId as a genuinely new comment", async () => {
    await call({ questionId: "q1", text: "birinci", operationId: "op-aaaaaaaa" });
    // Move past the rate limit window.
    store.set(`users/${STUDENT}/moderationMeta/throttle`, { data: { lastSubmissionAt: 0 } });
    await call({ questionId: "q1", text: "ikinci", operationId: "op-bbbbbbbb" });
    expect(commentDocs()).toHaveLength(2);
  });
});

describe("submitQuestionCommentForModeration — rate limiting", () => {
  beforeEach(seedPublicQuestion);

  it("refuses a second distinct comment inside the window", async () => {
    await call({ questionId: "q1", text: "birinci", operationId: "op-aaaaaaaa" });
    await expect(
      call({ questionId: "q1", text: "ikinci", operationId: "op-bbbbbbbb" }),
    ).rejects.toMatchObject({ code: "resource-exhausted" });
    expect(commentDocs()).toHaveLength(1);
  });

  it("uses server time, not a client-supplied timestamp", async () => {
    await call({ questionId: "q1", text: "birinci", operationId: "op-aaaaaaaa" });
    // A client claiming the last submission was long ago changes nothing.
    await expect(
      call({
        questionId: "q1",
        text: "ikinci",
        operationId: "op-bbbbbbbb",
        lastSubmissionAt: 0,
        now: 0,
      }),
    ).rejects.toMatchObject({ code: "resource-exhausted" });
  });

  it("does not rate-limit a retry of the same gesture", async () => {
    // A retry must not be punished for the submission it is retrying.
    const first = await call({ questionId: "q1", text: "merhaba", operationId: OP });
    const retry = await call({ questionId: "q1", text: "merhaba", operationId: OP });
    expect(retry.publishedEntityId).toBe(first.publishedEntityId);
  });
});

describe("submitQuestionCommentForModeration — transaction ordering", () => {
  it("performs every read before the first write", async () => {
    seedPublicQuestion();
    await call({ questionId: "q1", text: "merhaba", operationId: OP });
    expect(readAfterWriteDetected).toBe(false);
  });

  it("performs every read before the first write on the class path too", async () => {
    // The class-membership lookup is an EXTRA read, and the one most likely
    // to drift below a write in a future edit.
    store.set("questions/q1", {
      data: { ownerId: "teacher-uid", visibility: "class", organizationId: "org1", classId: "c1" },
    });
    store.set(`classes/c1/members/${STUDENT}`, { data: { role: "student" } });
    await call({ questionId: "q1", text: "merhaba", operationId: OP });
    expect(readAfterWriteDetected).toBe(false);
  });
});
