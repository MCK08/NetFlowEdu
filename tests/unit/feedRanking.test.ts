import {
  buildQuestionFeedRanking,
  QuestionSignal,
} from "../../src/features/feed/services/feedRanking";
import { Question } from "@/types/question";

function q(id: string, overrides: Partial<Question> = {}): Question {
  return {
    id,
    ownerId: "owner-1",
    organizationId: null,
    visibility: "public",
    imageUrl: `https://example.com/${id}.jpg`,
    classId: null,
    subject: "Matematik",
    topic: "Türev",
    gradeLevel: "9",
    description: null,
    posterRole: "teacher",
    createdAt: 0,
    likeCount: 0,
    commentCount: 0,
    answerCount: 0,
    choices: null,
    correctChoice: null,
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

const EMPTY_SEEN = new Set<string>();

describe("buildQuestionFeedRanking — tier priority", () => {
  it("puts a due question ahead of everything else", () => {
    const questions = [q("a"), q("b", { subject: "Fizik", topic: "Optik" })];
    const signals = new Map([["b", signal({ isDue: true })]]);
    const result = buildQuestionFeedRanking({ questions, signalsByQuestionId: signals, recentlyShownIds: EMPTY_SEEN });
    expect(result.map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("puts a struggled question ahead of a weak-but-not-struggled one", () => {
    const questions = [
      q("weak", { topic: "Weak" }),
      q("struggled", { topic: "Struggled" }),
    ];
    const signals = new Map([
      ["weak", signal({ masteryBand: "shaky" })],
      ["struggled", signal({ lastOutcome: "struggled" })],
    ]);
    const result = buildQuestionFeedRanking({ questions, signalsByQuestionId: signals, recentlyShownIds: EMPTY_SEEN });
    expect(result.map((x) => x.id)).toEqual(["struggled", "weak"]);
  });

  it("puts a weak topic ahead of a discovery (never-studied) question", () => {
    const questions = [q("discovery"), q("weak", { topic: "Weak" })];
    const signals = new Map([["weak", signal({ masteryBand: "learning" })]]);
    const result = buildQuestionFeedRanking({ questions, signalsByQuestionId: signals, recentlyShownIds: EMPTY_SEEN });
    expect(result.map((x) => x.id)).toEqual(["weak", "discovery"]);
  });

  it("puts a discovery question ahead of a developed (strong/mastered) one", () => {
    const questions = [q("developed", { topic: "Developed" }), q("discovery")];
    const signals = new Map([["developed", signal({ masteryBand: "strong" })]]);
    const result = buildQuestionFeedRanking({ questions, signalsByQuestionId: signals, recentlyShownIds: EMPTY_SEEN });
    expect(result.map((x) => x.id)).toEqual(["discovery", "developed"]);
  });

  it("never excludes mastered/developed questions entirely — they still appear, just last", () => {
    const questions = [q("mastered")];
    const signals = new Map([["mastered", signal({ masteryBand: "mastered" })]]);
    const result = buildQuestionFeedRanking({ questions, signalsByQuestionId: signals, recentlyShownIds: EMPTY_SEEN });
    expect(result.map((x) => x.id)).toEqual(["mastered"]);
  });
});

describe("buildQuestionFeedRanking — exploration vs reinforcement balance", () => {
  it("does not lock the feed onto weak topics alone — discovery items are interleaved above developed ones", () => {
    const questions = [
      q("developed1", { topic: "T1" }),
      q("discovery1"),
      q("developed2", { topic: "T2" }),
      q("discovery2"),
    ];
    const signals = new Map([
      ["developed1", signal({ masteryBand: "strong" })],
      ["developed2", signal({ masteryBand: "mastered" })],
    ]);
    const result = buildQuestionFeedRanking({ questions, signalsByQuestionId: signals, recentlyShownIds: EMPTY_SEEN });
    const discoveryPositions = result.map((x, i) => (x.id.startsWith("discovery") ? i : -1)).filter((i) => i >= 0);
    const developedPositions = result.map((x, i) => (x.id.startsWith("developed") ? i : -1)).filter((i) => i >= 0);
    expect(Math.max(...discoveryPositions)).toBeLessThan(Math.min(...developedPositions));
  });
});

describe("buildQuestionFeedRanking — recently shown deprioritization", () => {
  it("pushes a recently-shown question below a not-yet-shown one in the SAME tier", () => {
    const questions = [q("shown"), q("fresh", { topic: "Fresh" })];
    const result = buildQuestionFeedRanking({
      questions,
      signalsByQuestionId: new Map(),
      recentlyShownIds: new Set(["shown"]),
    });
    expect(result.map((x) => x.id)).toEqual(["fresh", "shown"]);
  });

  it("never excludes a recently-shown question — it still appears", () => {
    const questions = [q("only")];
    const result = buildQuestionFeedRanking({
      questions,
      signalsByQuestionId: new Map(),
      recentlyShownIds: new Set(["only"]),
    });
    expect(result.map((x) => x.id)).toEqual(["only"]);
  });

  it("does not let 'recently shown' override a real due obligation", () => {
    const questions = [q("due-but-shown"), q("fresh")];
    const signals = new Map([["due-but-shown", signal({ isDue: true })]]);
    const result = buildQuestionFeedRanking({
      questions,
      signalsByQuestionId: signals,
      recentlyShownIds: new Set(["due-but-shown"]),
    });
    expect(result.map((x) => x.id)).toEqual(["due-but-shown", "fresh"]);
  });
});

describe("buildQuestionFeedRanking — recency tiebreak", () => {
  it("within the same tier, a staler topic surfaces before a recently-practiced one", () => {
    const questions = [
      q("recent", { topic: "RecentTopic" }),
      q("stale", { topic: "StaleTopic" }),
    ];
    const signals = new Map([
      ["recent", signal({ masteryBand: "shaky", recency: "recently_practiced" })],
      ["stale", signal({ masteryBand: "shaky", recency: "stale" })],
    ]);
    const result = buildQuestionFeedRanking({ questions, signalsByQuestionId: signals, recentlyShownIds: EMPTY_SEEN });
    expect(result.map((x) => x.id)).toEqual(["stale", "recent"]);
  });
});

describe("buildQuestionFeedRanking — determinism, stability, robustness", () => {
  it("produces the same order for the same input across repeated calls", () => {
    const questions = [q("a"), q("b"), q("c")];
    const signals = new Map([["b", signal({ isDue: true })]]);
    const params = { questions, signalsByQuestionId: signals, recentlyShownIds: EMPTY_SEEN };
    const first = buildQuestionFeedRanking(params).map((x) => x.id);
    const second = buildQuestionFeedRanking(params).map((x) => x.id);
    expect(first).toEqual(second);
  });

  it("keeps original (stable) order for two questions tied on every signal", () => {
    const questions = [q("first"), q("second")];
    const result = buildQuestionFeedRanking({ questions, signalsByQuestionId: new Map(), recentlyShownIds: EMPTY_SEEN });
    expect(result.map((x) => x.id)).toEqual(["first", "second"]);
  });

  it("treats a question with no signal entry at all as a plain discovery item, never throwing", () => {
    const questions = [q("unknown")];
    expect(() =>
      buildQuestionFeedRanking({ questions, signalsByQuestionId: new Map(), recentlyShownIds: EMPTY_SEEN }),
    ).not.toThrow();
  });

  it("handles an empty question list", () => {
    expect(
      buildQuestionFeedRanking({ questions: [], signalsByQuestionId: new Map(), recentlyShownIds: EMPTY_SEEN }),
    ).toEqual([]);
  });

  it("does not mutate the input questions array", () => {
    const questions = [q("b"), q("a")];
    const copy = [...questions];
    const signals = new Map([["a", signal({ isDue: true })]]);
    buildQuestionFeedRanking({ questions, signalsByQuestionId: signals, recentlyShownIds: EMPTY_SEEN });
    expect(questions).toEqual(copy);
  });

  it("does not mutate the signals map or the recentlyShownIds set", () => {
    const questions = [q("a")];
    const signals = new Map([["a", signal({ isDue: true })]]);
    const signalsCopy = new Map(signals);
    const seen = new Set(["a"]);
    const seenCopy = new Set(seen);
    buildQuestionFeedRanking({ questions, signalsByQuestionId: signals, recentlyShownIds: seen });
    expect(signals).toEqual(signalsCopy);
    expect(seen).toEqual(seenCopy);
  });
});
