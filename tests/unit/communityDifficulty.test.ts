import { readFileSync } from "fs";
import { join } from "path";

// Phase 108 — "Topluluk Zorluk Sinyali", tested against the REAL handlers
// (recordStudyOutcome, listCommunityDifficultQuestionsForUser) over an
// in-memory, path-keyed fake of firebase-admin's Firestore. The fake keeps
// the read-before-write transaction rule, and adds the two query shapes the
// discovery endpoint uses: a single-field range query and db.getAll.

type DocData = Record<string, unknown>;
// The fake is intentionally loosely typed: the handlers under test take the
// real Firestore types, and the point is to run them, not to model the SDK.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fake = any;
const store = new Map<string, DocData>();

function snapshotOf(path: string) {
  const data = store.get(path);
  return { exists: data !== undefined, data: () => data, id: path.split("/").pop(), ref: docRef(path) };
}

function docRef(path: string): Fake {
  const segments = path.split("/");
  return {
    id: segments[segments.length - 1],
    path,
    get parent() {
      return collectionRef(segments.slice(0, -1).join("/"));
    },
    async get() {
      return snapshotOf(path);
    },
    async set(data: DocData, options?: { merge?: boolean }) {
      if (options?.merge) store.set(path, { ...(store.get(path) ?? {}), ...data });
      else store.set(path, { ...data });
    },
    async update(data: DocData) {
      store.set(path, { ...(store.get(path) ?? {}), ...data });
    },
    async delete() {
      store.delete(path);
    },
    collection(name: string) {
      return collectionRef(`${path}/${name}`);
    },
  };
}

interface QueryState {
  path: string;
  filters: { field: string; op: string; value: unknown }[];
  order: { field: string; direction: string } | null;
  limitCount: number | null;
}

function queryRef(state: QueryState): Fake {
  return {
    where(field: string, op: string, value: unknown) {
      return queryRef({ ...state, filters: [...state.filters, { field, op, value }] });
    },
    orderBy(field: string, direction = "asc") {
      return queryRef({ ...state, order: { field, direction } });
    },
    limit(count: number) {
      return queryRef({ ...state, limitCount: count });
    },
    async get() {
      const depth = state.path.split("/").length + 1;
      let docs = [...store.entries()]
        .filter(([p]) => p.startsWith(`${state.path}/`) && p.split("/").length === depth)
        .map(([p]) => snapshotOf(p));
      for (const filter of state.filters) {
        docs = docs.filter((snap) => {
          const value = (snap.data() ?? {})[filter.field] as number;
          if (filter.op === ">=") return value >= (filter.value as number);
          if (filter.op === "==") return value === filter.value;
          throw new Error(`unsupported op ${filter.op}`);
        });
      }
      if (state.order) {
        const { field, direction } = state.order;
        docs.sort((a, b) => {
          const av = (a.data() ?? {})[field] as number;
          const bv = (b.data() ?? {})[field] as number;
          return direction === "desc" ? bv - av : av - bv;
        });
      }
      if (state.limitCount !== null) docs = docs.slice(0, state.limitCount);
      return { empty: docs.length === 0, docs, size: docs.length };
    },
  };
}

function collectionRef(path: string): Fake {
  const segments = path.split("/");
  return {
    ...queryRef({ path, filters: [], order: null, limitCount: null }),
    id: segments[segments.length - 1],
    get parent() {
      return segments.length > 1 ? docRef(segments.slice(0, -1).join("/")) : null;
    },
    doc(id: string) {
      return docRef(`${path}/${id}`);
    },
  };
}

function mockFakeDb() {
  return {
    collection(name: string) {
      return collectionRef(name);
    },
    async getAll(...refs: { path: string }[]) {
      return refs.map((ref) => snapshotOf(ref.path));
    },
    async runTransaction(fn: (tx: unknown) => Promise<unknown>) {
      let hasWritten = false;
      const assertReadPhase = () => {
        if (hasWritten) throw new Error("Firestore transactions require all reads to be executed before all writes.");
      };
      const tx = {
        get: (ref: { get: () => unknown }) => {
          assertReadPhase();
          return ref.get();
        },
        set: (ref: { set: (d: DocData, o?: { merge?: boolean }) => unknown }, data: DocData, options?: { merge?: boolean }) => {
          hasWritten = true;
          return ref.set(data, options);
        },
        update: (ref: { update: (d: DocData) => unknown }, data: DocData) => {
          hasWritten = true;
          return ref.update(data);
        },
        delete: (ref: { delete: () => unknown }) => {
          hasWritten = true;
          return ref.delete();
        },
      };
      return fn(tx);
    },
  };
}

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: () => mockFakeDb(),
  FieldValue: { serverTimestamp: () => "__SERVER_TIMESTAMP__" },
}));

// eslint-disable-next-line import/first
import { recordStudyOutcome } from "../../functions/src/study/recordStudyOutcome";
// eslint-disable-next-line import/first
import {
  applyCommunityTransition,
  listCommunityDifficultQuestionsForUser,
  MIN_COMMUNITY_COHORT,
  resolveCommunityBand,
} from "../../functions/src/study/communityDifficulty";

const ROOT = join(__dirname, "..", "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");

function studentRequest(data: Record<string, unknown>, uid: string) {
  return { data, auth: { uid, token: { role: "student" } } } as never;
}

function seedQuestion(id: string, overrides: DocData = {}) {
  store.set(`questions/${id}`, {
    ownerId: "owner1",
    visibility: "public",
    classId: null,
    subject: "Matematik",
    topic: "Denklemler",
    imageUrl: `https://example.test/${id}.jpg`,
    ...overrides,
  });
}

function seedStats(id: string, attemptedStudents: number, struggledStudents: number) {
  store.set(`questionStats/${id}`, {
    attemptedStudents,
    struggledStudents,
    band: resolveCommunityBand({ attemptedStudents, struggledStudents }),
    schemaVersion: 1,
    updatedAt: 1,
  });
}

const stats = (id: string) => store.get(`questionStats/${id}`);
const record = (uid: string, questionId: string, outcome: string, operationId?: string) =>
  recordStudyOutcome.run(studentRequest({ questionId, outcome, ...(operationId ? { operationId } : {}) }, uid));

beforeEach(() => store.clear());

describe("band thresholds", () => {
  it("is insufficient below the floor, whatever the shares", () => {
    expect(MIN_COMMUNITY_COHORT).toBe(5);
    expect(resolveCommunityBand({ attemptedStudents: 4, struggledStudents: 4 })).toBe("insufficient");
    expect(resolveCommunityBand({ attemptedStudents: 0, struggledStudents: 0 })).toBe("insufficient");
  });

  it("bands a cohort at or above the floor by the documented shares", () => {
    expect(resolveCommunityBand({ attemptedStudents: 5, struggledStudents: 3 })).toBe("challenging");
    expect(resolveCommunityBand({ attemptedStudents: 8, struggledStudents: 4 })).toBe("challenging");
    expect(resolveCommunityBand({ attemptedStudents: 8, struggledStudents: 2 })).toBe("average");
    expect(resolveCommunityBand({ attemptedStudents: 8, struggledStudents: 1 })).toBe("light");
  });
});

describe("distinct-student transitions", () => {
  it("counts a student once on their first outcome and once on their first struggle", () => {
    const first = applyCommunityTransition(null, { previousItem: null, outcome: "solved" });
    expect(first).toEqual({ attemptedStudents: 1, struggledStudents: 0, band: "insufficient" });
    const struggled = applyCommunityTransition({ ...first }, { previousItem: { struggledCount: 0 }, outcome: "struggled" });
    expect(struggled.attemptedStudents).toBe(1);
    expect(struggled.struggledStudents).toBe(1);
  });

  it("does not inflate on a second attempt or a second struggle by the same student", () => {
    const stored = { attemptedStudents: 6, struggledStudents: 2 };
    expect(applyCommunityTransition(stored, { previousItem: { struggledCount: 0 }, outcome: "solved" })).toMatchObject(stored);
    expect(applyCommunityTransition(stored, { previousItem: { struggledCount: 1 }, outcome: "struggled" })).toMatchObject(stored);
    // Struggled can never exceed attempted, even from a malformed document.
    expect(applyCommunityTransition({ attemptedStudents: 1, struggledStudents: 5 }, { previousItem: {}, outcome: "again" }).struggledStudents).toBe(1);
  });
});

describe("recordStudyOutcome maintains the aggregate", () => {
  it("writes per-student counters with no uid, and a replay changes nothing", async () => {
    seedQuestion("q1");
    await record("s1", "q1", "struggled", "op00001-aaaa");
    expect(stats("q1")).toMatchObject({ attemptedStudents: 1, struggledStudents: 1, band: "insufficient", schemaVersion: 1 });
    await record("s1", "q1", "struggled", "op00001-aaaa");
    expect(stats("q1")).toMatchObject({ attemptedStudents: 1, struggledStudents: 1 });
    await record("s1", "q1", "struggled", "op00002-bbbb");
    expect(stats("q1")).toMatchObject({ attemptedStudents: 1, struggledStudents: 1 });
    expect(JSON.stringify(stats("q1"))).not.toContain("s1");
  });

  it("crosses the floor only with five distinct students and then bands", async () => {
    seedQuestion("q1");
    for (const uid of ["a", "b", "c", "d"]) await record(uid, "q1", "struggled");
    expect(stats("q1")).toMatchObject({ attemptedStudents: 4, struggledStudents: 4, band: "insufficient" });
    await record("e", "q1", "solved");
    expect(stats("q1")).toMatchObject({ attemptedStudents: 5, struggledStudents: 4, band: "challenging" });
  });
});

describe("listCommunityDifficultQuestions — privacy", () => {
  function seedCohort(id: string, attempted: number, struggled: number, overrides: DocData = {}) {
    seedQuestion(id, overrides);
    seedStats(id, attempted, struggled);
  }

  it("rejects an unauthenticated caller", async () => {
    await expect(listCommunityDifficultQuestionsForUser(mockFakeDb() as never, undefined)).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("returns aggregate rows only — no uid, name, email, answer or history — and no ranking", async () => {
    seedCohort("q1", 8, 6);
    seedCohort("q2", 6, 2);
    store.set("users/other/studyItems/q1", { struggledCount: 3, lastOutcome: "struggled", displayName: "Ayşe", email: "a@x.test" });
    store.set("users/me/studyItems/q2", { struggledCount: 1, lastOutcome: "solved" });
    const result = await listCommunityDifficultQuestionsForUser(mockFakeDb() as never, "me");
    expect(result.questions.map((q) => q.questionId)).toEqual(["q1", "q2"]);
    expect(result.questions[0]).toEqual({
      questionId: "q1",
      subject: "Matematik",
      topic: "Denklemler",
      imageUrl: "https://example.test/q1.jpg",
      band: "challenging",
      cohortSize: 8,
      ownRelation: "not_attempted",
    });
    expect(result.questions[1]?.ownRelation).toBe("solved_later");
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/other|Ayşe|email|@x\.test|displayName|struggledCount|rank|percentile|score/);
    expect(Object.keys(result.questions[0] as object).sort()).toEqual(
      ["band", "cohortSize", "imageUrl", "ownRelation", "questionId", "subject", "topic"],
    );
  });

  it("never returns a cohort below the floor, not even as a count", async () => {
    seedCohort("small", 4, 4);
    seedCohort("big", 5, 3);
    const result = await listCommunityDifficultQuestionsForUser(mockFakeDb() as never, "me");
    expect(result.questions.map((q) => q.questionId)).toEqual(["big"]);
    expect(JSON.stringify(result)).not.toContain("small");
  });

  it("drops questions the caller cannot read: private, another class, deleted", async () => {
    seedCohort("public", 6, 4);
    seedCohort("mine-private", 6, 4, { visibility: "private", ownerId: "me" });
    seedCohort("their-private", 6, 4, { visibility: "private", ownerId: "other" });
    seedCohort("my-class", 6, 4, { visibility: "class", classId: "c1" });
    seedCohort("other-class", 6, 4, { visibility: "class", classId: "c2" });
    seedStats("deleted", 9, 9);
    store.set("classes/c1/members/me", { role: "student" });
    const result = await listCommunityDifficultQuestionsForUser(mockFakeDb() as never, "me");
    expect(result.questions.map((q) => q.questionId).sort()).toEqual(["mine-private", "my-class", "public"]);
  });

  it("orders by band, then cohort size, then id — no per-student ranking exists", async () => {
    seedCohort("light", 20, 1);
    seedCohort("avg", 10, 3);
    seedCohort("hard-small", 5, 5);
    seedCohort("hard-big", 12, 7);
    const result = await listCommunityDifficultQuestionsForUser(mockFakeDb() as never, "me");
    expect(result.questions.map((q) => q.questionId)).toEqual(["hard-big", "hard-small", "avg", "light"]);
  });
});

describe("client boundary", () => {
  it("the rules expose questionStats as gated single reads only; list and write are denied", () => {
    const rules = read("firestore.rules");
    const block = rules.slice(rules.indexOf("match /questionStats/{questionId} {"));
    const body = block.slice(0, block.indexOf("\n    }") + 1);
    expect(body).toContain("allow get: if isSignedIn() && canReadQuestionData(questionData(questionId));");
    expect(body).toContain("allow list: if false;");
    expect(body).toContain("allow write: if false;");
  });

  it("the client reads one aggregate document and the callable; it never queries other users", () => {
    const service = read("src/features/communityDifficulty/services/communityDifficultyService.ts");
    expect(service).toContain('doc(db, "questionStats", questionId)');
    expect(service).toContain('(functions, "listCommunityDifficultQuestions")');
    expect(service).not.toMatch(/collectionGroup|studyItems/);
    const band = read("src/features/communityDifficulty/services/communityBand.ts");
    expect(band).toContain('"Topluluk karşılaştırması için henüz yeterli veri yok."');
    // Tones are a property of the question's difficulty, never an alarm.
    expect(band).not.toMatch(/:\s*"danger"/);
  });

  it("the daily plan never fetches the community signal and treats a band as a tie-breaker only", () => {
    const hook = read("src/features/studyPlan/hooks/useStudyPlan.ts");
    expect(hook).not.toMatch(/communityDifficulty|questionStats|listCommunityDifficultQuestions/);
    const planner = read("src/features/studyPlan/services/dailyPlan.ts");
    expect(planner).toContain("tie-breaker only");
    expect(planner).not.toMatch(/Yapay zek/i);
  });
});
