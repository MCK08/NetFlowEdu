import {
  selectOwnQuestions,
  selectStruggleQuestions,
} from "../../src/features/feed/services/channelSelection";
import { QuestionSignal } from "../../src/features/feed/services/feedRanking";
import { Question } from "../../src/types/question";

function q(id: string, overrides: Partial<Question> = {}): Question {
  return {
    id,
    ownerId: "owner-1",
    organizationId: "org-1",
    visibility: "public",
    imageUrl: `https://example.com/${id}.jpg`,
    classId: null,
    subject: "Matematik",
    topic: "Denklemler",
    gradeLevel: "9",
    description: null,
    posterRole: "teacher",
    createdAt: 0,
    likeCount: 0,
    commentCount: 0,
    answerCount: 0,
    choices: null,
    correctChoice: null,
    hints: [],
    ...overrides,
  };
}

function signal(overrides: Partial<QuestionSignal> = {}): QuestionSignal {
  return {
    isDue: false,
    lastOutcome: null,
    masteryBand: null,
    recency: null,
    ...overrides,
  };
}

describe("selectStruggleQuestions — Zorlandıklarım", () => {
  it("keeps a question whose last recorded outcome was a struggle", () => {
    const pool = [q("struggled-one")];
    const signals = new Map([["struggled-one", signal({ lastOutcome: "struggled" })]]);
    expect(selectStruggleQuestions(pool, signals).map((item) => item.id)).toEqual(["struggled-one"]);
  });

  it("drops a question the student solved", () => {
    const pool = [q("solved-one")];
    const signals = new Map([["solved-one", signal({ lastOutcome: "solved" })]]);
    expect(selectStruggleQuestions(pool, signals)).toEqual([]);
  });

  // Phase 41/42 semantics, reused verbatim: "again" is a request to see the
  // card again shortly, not a report of difficulty.
  it("does NOT treat 'again' as a struggle", () => {
    const pool = [q("again-one")];
    const signals = new Map([["again-one", signal({ lastOutcome: "again" })]]);
    expect(selectStruggleQuestions(pool, signals)).toEqual([]);
  });

  // The legacy-honesty case (a Student-D-like account): real attempts, no
  // trustworthy evidence. Absence must never be read as "not struggled" NOR
  // fabricated into a struggle — the question simply does not appear.
  it("excludes a question with no signal at all rather than inventing evidence", () => {
    const pool = [q("never-studied")];
    expect(selectStruggleQuestions(pool, new Map())).toEqual([]);
  });

  it("excludes a question whose signal exists but carries no outcome", () => {
    const pool = [q("no-outcome")];
    const signals = new Map([["no-outcome", signal({ lastOutcome: null })]]);
    expect(selectStruggleQuestions(pool, signals)).toEqual([]);
  });

  it("returns an empty list (never a fallback to everything) when nothing matches", () => {
    const pool = [q("a"), q("b"), q("c")];
    expect(selectStruggleQuestions(pool, new Map())).toEqual([]);
  });

  it("preserves the incoming order of the questions it keeps", () => {
    const pool = [q("first"), q("skipped"), q("second")];
    const signals = new Map([
      ["first", signal({ lastOutcome: "struggled" })],
      ["skipped", signal({ lastOutcome: "solved" })],
      ["second", signal({ lastOutcome: "struggled" })],
    ]);
    expect(selectStruggleQuestions(pool, signals).map((item) => item.id)).toEqual([
      "first",
      "second",
    ]);
  });

  it("does not mutate its input", () => {
    const pool = [q("a"), q("b")];
    const copy = [...pool];
    selectStruggleQuestions(pool, new Map([["a", signal({ lastOutcome: "struggled" })]]));
    expect(pool).toEqual(copy);
  });
});

describe("selectOwnQuestions — İçeriklerim", () => {
  it("keeps only questions owned by the given uid", () => {
    const pool = [q("mine", { ownerId: "teacher-1" }), q("theirs", { ownerId: "teacher-2" })];
    expect(selectOwnQuestions(pool, "teacher-1").map((item) => item.id)).toEqual(["mine"]);
  });

  it("returns nothing for a missing uid rather than everything", () => {
    const pool = [q("mine", { ownerId: "teacher-1" })];
    expect(selectOwnQuestions(pool, undefined)).toEqual([]);
    expect(selectOwnQuestions(pool, null)).toEqual([]);
  });

  it("does not mutate its input", () => {
    const pool = [q("a", { ownerId: "teacher-1" })];
    const copy = [...pool];
    selectOwnQuestions(pool, "teacher-1");
    expect(pool).toEqual(copy);
  });
});
