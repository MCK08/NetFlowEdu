// The ANSWER publication gate, driven through the REAL callable handler
// against strict Firestore and Storage fakes plus a fake Vision provider.
//
// The Firestore fake throws on any read issued after the first write — the
// same assertion added after an in-memory fake that did NOT model that
// ordering let 882 green tests coexist with a production outage.

type DocData = Record<string, unknown>;

const store = new Map<string, { data: DocData | null }>();
let generatedIds = 0;
let readAfterWriteDetected = false;

function docRef(path: string[]) {
  const key = path.join("/");
  return {
    id: path[path.length - 1],
    get() {
      const entry = store.get(key);
      return { exists: entry?.data != null, data: () => entry?.data ?? undefined };
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

const fakeDb = {
  collection: (name: string) => collectionRef([name]),
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
      set: (
        ref: { set: (d: DocData, o?: { merge?: boolean }) => void },
        data: DocData,
        options?: { merge?: boolean },
      ) => {
        hasWritten = true;
        ref.set(data, options);
      },
    };
    return fn(tx);
  },
};

// ---- Storage fake ---------------------------------------------------------
interface FakeObject {
  contentType: string;
  size: number;
}
const objects = new Map<string, FakeObject>();
const copies: { from: string; to: string }[] = [];

const fakeBucket = {
  name: "netflowedu-test.appspot.com",
  file(path: string) {
    return {
      async exists() {
        return [objects.has(path)];
      },
      async getMetadata() {
        const o = objects.get(path);
        return [{ contentType: o?.contentType, size: String(o?.size ?? 0) }];
      },
      async copy(destination: { _path: string }) {
        copies.push({ from: path, to: destination._path });
        const source = objects.get(path);
        if (source) objects.set(destination._path, source);
      },
      async setMetadata() {
        return [{}];
      },
      _path: path,
    };
  },
};

// ---- Vision fake ----------------------------------------------------------
// jest.mock factories are hoisted above declarations, so anything they close
// over must be mock-prefixed. Both are reset in beforeEach.
let mockVisionResult: unknown = null;
let mockAnalyzeCount = 0;

jest.mock("firebase-admin/firestore", () => ({ getFirestore: () => fakeDb }));
jest.mock("firebase-admin/storage", () => ({ getStorage: () => ({ bucket: () => fakeBucket }) }));
jest.mock("firebase-functions/v2/https", () => {
  class FakeHttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return { HttpsError: FakeHttpsError, onCall: (_o: unknown, h: unknown) => h };
});
jest.mock("../../functions/src/moderation/providers", () => {
  const actual = jest.requireActual("../../functions/src/moderation/providers");
  return {
    ...actual,
    resolveProviders: () => ({
      text: null,
      imageAnalysis: {
        analyzeImage: async () => {
          mockAnalyzeCount += 1;
          return mockVisionResult;
        },
      },
    }),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { submitAnswerForModeration } = require("../../functions/src/moderation/submitAnswer");

type Handler = (req: {
  auth?: { uid: string; token: Record<string, unknown> };
  data: Record<string, unknown>;
}) => Promise<{ submissionId: string; status: string; publishedEntityId: string | null }>;

const submit = submitAnswerForModeration as unknown as Handler;

const STUDENT = "student-uid";
const OP = "op-abcdefgh";
const SUBMISSION = `${STUDENT}_${OP}`;
const QUARANTINE = `moderation/pending/${STUDENT}/${SUBMISSION}/upload.png`;

const CLEAN_VISION = {
  image: { outcome: "clean", categories: [], retryable: false },
  extractedText: "x + y = 5",
  imageTextAvailable: true,
};

function seedQuestion(overrides: DocData = {}) {
  store.set("questions/q1", {
    data: {
      ownerId: "teacher-uid",
      visibility: "public",
      organizationId: "org1",
      classId: null,
      ...overrides,
    },
  });
}

function seedUpload(contentType = "image/png", size = 5000) {
  objects.set(QUARANTINE, { contentType, size });
}

function call(data: Partial<Record<string, unknown>> = {}, uid = STUDENT) {
  return submit({
    auth: { uid, token: { role: "student" } },
    data: {
      questionId: "q1",
      storagePath: QUARANTINE,
      contentType: "image/png",
      method: "drawing",
      operationId: OP,
      ...data,
    },
  });
}

function answerDocs() {
  return [...store.entries()].filter(([k]) => k.startsWith("answers/"));
}

beforeEach(() => {
  store.clear();
  objects.clear();
  copies.length = 0;
  generatedIds = 0;
  readAfterWriteDetected = false;
  mockVisionResult = CLEAN_VISION;
  mockAnalyzeCount = 0;
  seedQuestion();
  seedUpload();
});

describe("submitAnswerForModeration — authorization and validation", () => {
  it("rejects an unauthenticated caller", async () => {
    await expect(
      submit({ data: { questionId: "q1", storagePath: QUARANTINE, contentType: "image/png", method: "drawing", operationId: OP } }),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("denies a private question the caller does not own", async () => {
    seedQuestion({ visibility: "private", ownerId: "someone-else" });
    await expect(call()).rejects.toMatchObject({ code: "permission-denied" });
    expect(answerDocs()).toHaveLength(0);
  });

  it("denies a class question when the caller is not a member", async () => {
    seedQuestion({ visibility: "class", classId: "c1" });
    await expect(call()).rejects.toMatchObject({ code: "permission-denied" });
    expect(answerDocs()).toHaveLength(0);
  });

  it("allows a class member", async () => {
    seedQuestion({ visibility: "class", classId: "c1" });
    store.set(`classes/c1/members/${STUDENT}`, { data: { role: "student" } });
    expect((await call()).status).toBe("published");
  });

  it("rejects a malformed operationId", async () => {
    await expect(call({ operationId: "short" })).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects an unsupported declared MIME", async () => {
    await expect(call({ contentType: "image/gif" })).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("rejects a storage path belonging to another user", async () => {
    await expect(
      call({ storagePath: `moderation/pending/attacker/${SUBMISSION}/upload.png` }),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("rejects a path aimed at the already-public answers tree", async () => {
    await expect(
      call({ storagePath: "answers/public/q1/student-uid/x.png" }),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("fails when no file was actually uploaded", async () => {
    objects.clear();
    await expect(call()).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("rejects when the STORED object's real type is not an allowed image", async () => {
    // The declared type said image/png; the real object is something else.
    // Trusting the declaration is exactly how a fake MIME gets through.
    seedUpload("application/pdf");
    await expect(call()).rejects.toMatchObject({ code: "invalid-argument" });
    expect(answerDocs()).toHaveLength(0);
  });

  it("rejects an oversized object", async () => {
    seedUpload("image/png", 11 * 1024 * 1024);
    await expect(call()).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects a zero-byte object", async () => {
    seedUpload("image/png", 0);
    await expect(call()).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

describe("submitAnswerForModeration — publication gate", () => {
  it("publishes exactly one answer for a clean image", async () => {
    const result = await call();
    expect(result.status).toBe("published");
    expect(answerDocs()).toHaveLength(1);
    // And the object was copied out of quarantine into the approved path.
    expect(copies).toHaveLength(1);
    expect(copies[0]?.to).toBe(`answers/public/q1/${STUDENT}/${SUBMISSION}.png`);
  });

  it("creates NO answer when SafeSearch blocks", async () => {
    mockVisionResult = {
      image: { outcome: "block", categories: ["adult"], retryable: false },
      extractedText: "",
      imageTextAvailable: true,
    };
    const result = await call();
    expect(result.status).toBe("not_published");
    expect(answerDocs()).toHaveLength(0);
    // Nothing was copied, so nothing readable exists anywhere.
    expect(copies).toHaveLength(0);
  });

  it("creates NO answer when OCR finds handwritten profanity", async () => {
    // The image itself looks fine; the writing on it does not.
    mockVisionResult = {
      image: { outcome: "clean", categories: [], retryable: false },
      extractedText: "siktir git",
      imageTextAvailable: true,
    };
    const result = await call();
    expect(result.status).toBe("not_published");
    expect(answerDocs()).toHaveLength(0);
    expect(copies).toHaveLength(0);
  });

  it("routes an uncertain image to manual review without publishing", async () => {
    mockVisionResult = {
      image: { outcome: "review", categories: ["racy"], retryable: false },
      extractedText: "",
      imageTextAvailable: true,
    };
    const result = await call();
    expect(result.status).toBe("in_review");
    expect(answerDocs()).toHaveLength(0);
  });

  it("does NOT publish when Vision is unavailable", async () => {
    // Fail closed: an API outage (or vision.googleapis.com being disabled)
    // must never auto-approve.
    mockVisionResult = {
      image: { outcome: "unavailable", categories: ["provider_unavailable"], retryable: true },
      extractedText: "",
      imageTextAvailable: false,
    };
    const result = await call();
    expect(result.status).toBe("in_review");
    expect(answerDocs()).toHaveLength(0);
    expect(copies).toHaveLength(0);
  });

  it("does NOT publish when OCR never ran, even with a clean image verdict", async () => {
    // An image classifier is exactly what misses a page of handwriting.
    mockVisionResult = {
      image: { outcome: "clean", categories: [], retryable: false },
      extractedText: "",
      imageTextAvailable: false,
    };
    expect((await call()).status).toBe("in_review");
    expect(answerDocs()).toHaveLength(0);
  });

  it("records a submission even when nothing is published", async () => {
    mockVisionResult = {
      image: { outcome: "block", categories: ["violence"], retryable: false },
      extractedText: "",
      imageTextAvailable: true,
    };
    await call();
    const submission = store.get(`moderationSubmissions/${SUBMISSION}`);
    expect(submission?.data?.status).toBe("rejected");
    expect(submission?.data?.publishedEntityId).toBeNull();
    expect(submission?.data?.targetType).toBe("answer_image");
  });

  it("stores no raw provider payload on the submission", async () => {
    await call();
    const submission = store.get(`moderationSubmissions/${SUBMISSION}`) ?? { data: {} };
    const serialized = JSON.stringify(submission.data);
    expect(serialized).not.toContain("safeSearchAnnotation");
    expect(serialized).not.toContain("fullTextAnnotation");
    // The OCR'd text itself is not persisted either.
    expect(serialized).not.toContain("x + y = 5");
  });

  it("ignores a client-supplied status", async () => {
    mockVisionResult = {
      image: { outcome: "block", categories: ["adult"], retryable: false },
      extractedText: "",
      imageTextAvailable: true,
    };
    await call({ status: "approved", publishedEntityId: "forged" });
    expect(store.get(`moderationSubmissions/${SUBMISSION}`)?.data?.status).toBe("rejected");
    expect(answerDocs()).toHaveLength(0);
  });
});

describe("submitAnswerForModeration — idempotency", () => {
  it("does not publish twice for the same operationId", async () => {
    const first = await call();
    const second = await call();
    expect(answerDocs()).toHaveLength(1);
    expect(second.publishedEntityId).toBe(first.publishedEntityId);
  });

  it("does not re-analyse on replay", async () => {
    await call();
    await call();
    await call();
    // A retry must not pay for a second Vision analysis of the same image —
    // that is a real bill, and a second analysis could reach a different
    // decision for identical content.
    expect(mockAnalyzeCount).toBe(1);
  });

  it("keeps publishedEntityId stable across replays", async () => {
    const first = await call();
    for (let i = 0; i < 4; i += 1) {
      expect((await call()).publishedEntityId).toBe(first.publishedEntityId);
    }
    expect(answerDocs()).toHaveLength(1);
  });

  it("does not resurrect a rejected submission on replay", async () => {
    mockVisionResult = {
      image: { outcome: "block", categories: ["adult"], retryable: false },
      extractedText: "",
      imageTextAvailable: true,
    };
    await call();
    expect((await call()).status).toBe("not_published");
    expect(answerDocs()).toHaveLength(0);
  });
});

describe("submitAnswerForModeration — rate limiting", () => {
  it("refuses a second distinct answer inside the window", async () => {
    await call();
    objects.set(`moderation/pending/${STUDENT}/${STUDENT}_op-bbbbbbbb/upload.png`, {
      contentType: "image/png",
      size: 100,
    });
    await expect(
      call({
        operationId: "op-bbbbbbbb",
        storagePath: `moderation/pending/${STUDENT}/${STUDENT}_op-bbbbbbbb/upload.png`,
      }),
    ).rejects.toMatchObject({ code: "resource-exhausted" });
    expect(answerDocs()).toHaveLength(1);
  });

  it("does not rate-limit a retry of the same gesture", async () => {
    const first = await call();
    expect((await call()).publishedEntityId).toBe(first.publishedEntityId);
  });
});

describe("submitAnswerForModeration — transaction ordering", () => {
  it("performs every read before the first write", async () => {
    await call();
    expect(readAfterWriteDetected).toBe(false);
  });

  it("performs every read before the first write on the class path", async () => {
    seedQuestion({ visibility: "class", classId: "c1" });
    store.set(`classes/c1/members/${STUDENT}`, { data: { role: "student" } });
    await call();
    expect(readAfterWriteDetected).toBe(false);
  });

  it("performs every read before the first write when rejecting", async () => {
    mockVisionResult = {
      image: { outcome: "block", categories: ["adult"], retryable: false },
      extractedText: "",
      imageTextAvailable: true,
    };
    await call();
    expect(readAfterWriteDetected).toBe(false);
  });
});

describe("submitAnswerForModeration — concurrent finalization", () => {
  it("does not create a second answer when another device finalizes mid-flight", async () => {
    // The in-transaction replay guard, isolated.
    //
    // The early pre-Vision check cannot catch this: at that moment no
    // submission existed. The Vision fake below writes the submission while
    // the analysis is "in flight", which is exactly what a second device
    // completing first looks like. Without the guard INSIDE the transaction,
    // this publishes a second answer.
    store.set(`moderationSubmissions/${SUBMISSION}`, { data: null });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const providers = require("../../functions/src/moderation/providers");
    const original = providers.resolveProviders;
    providers.resolveProviders = () => ({
      text: null,
      imageAnalysis: {
        analyzeImage: async () => {
          store.set(`moderationSubmissions/${SUBMISSION}`, {
            data: {
              submissionId: SUBMISSION,
              status: "approved",
              publishedEntityId: "answer-from-other-device",
            },
          });
          return CLEAN_VISION;
        },
      },
    });
    try {
      const result = await call();
      expect(result.publishedEntityId).toBe("answer-from-other-device");
      expect(answerDocs()).toHaveLength(0);
    } finally {
      providers.resolveProviders = original;
    }
  });
});

describe("submitAnswerForModeration — provider outage with OCR available", () => {
  it("does not publish when the image verdict is unavailable but OCR ran", async () => {
    // Distinct from the "OCR never ran" case: here the ONLY thing missing is
    // the image safety verdict, so this pins the unavailable branch itself.
    mockVisionResult = {
      image: { outcome: "unavailable", categories: ["provider_unavailable"], retryable: true },
      extractedText: "tamamen normal bir cevap",
      imageTextAvailable: true,
    };
    const result = await call();
    expect(result.status).toBe("in_review");
    expect(answerDocs()).toHaveLength(0);
    expect(copies).toHaveLength(0);
  });
});
