// Phase 56 — the student story's honesty rules.
//
// Most of these are not "does it render the right words" tests: they are
// guards against the specific ways this feature could start lying. The two
// that matter most are the legacy case (missing counters must never become
// "0 zorlanma") and the temporal case (no window exists, so no copy may imply
// one).

import { buildStudentLearningStory, MAX_STORY_MOMENTS } from "../../src/features/learningStory/services/buildStudentLearningStory";
import { LearningInsightItem } from "../../src/features/study/services/learningInsights";

function item(overrides: Partial<LearningInsightItem> = {}): LearningInsightItem {
  return {
    questionId: "q1",
    status: "review",
    lastOutcome: "solved",
    nextReviewAt: 0,
    subject: "Matematik",
    topic: "Denklemler",
    successfulReviews: 1,
    lastReviewedAt: 0,
    outcomeHistory: { solvedCount: 3, struggledCount: 0, againCount: 0, knownOutcomeCount: 3 },
    ...overrides,
  };
}

function allCopy(story: ReturnType<typeof buildStudentLearningStory>): string {
  return [
    story.headline,
    story.subheadline ?? "",
    ...story.moments.flatMap((m) => [m.title, m.description, m.action?.label ?? ""]),
  ].join(" | ");
}

describe("buildStudentLearningStory — evidence honesty", () => {
  it("treats missing counters as unknown, never as zero", () => {
    // The legacy/Student-D case: a pre-Phase-41 item whose history was never
    // counted. It may still be described, but never with a number.
    const story = buildStudentLearningStory([
      item({ outcomeHistory: null, lastOutcome: "struggled", status: "learning", successfulReviews: 0 }),
    ]);
    const copy = allCopy(story);
    expect(copy).not.toMatch(/0 kez/);
    expect(copy).not.toMatch(/0 zorlan/);
    expect(copy).not.toMatch(/Henüz hiç zorlanmadın/);
    // Nothing is claimed about it at all.
    expect(story.moments).toHaveLength(0);
  });

  it("says nothing at all about a topic whose history was never counted", () => {
    // Phase 42 refuses to classify an item with incomplete counters, so the
    // topic produces no moment rather than a vague one. Silence is the honest
    // output here — the alternative is a card implying knowledge that the
    // counters cannot support.
    const story = buildStudentLearningStory([
      item({ questionId: "a", outcomeHistory: null, lastOutcome: "struggled", status: "learning", successfulReviews: 0 }),
      item({ questionId: "b", outcomeHistory: null, lastOutcome: "struggled", status: "learning", successfulReviews: 0 }),
    ]);
    expect(story.moments).toHaveLength(0);
    expect(story.isFirstRun).toBe(true);
  });

  it("every emitted moment carries fully-counted evidence", () => {
    const story = buildStudentLearningStory([
      item({ questionId: "a", lastOutcome: "solved", successfulReviews: 1,
             outcomeHistory: { solvedCount: 1, struggledCount: 3, againCount: 0, knownOutcomeCount: 4 } }),
      item({ questionId: "b", subject: "Fizik", topic: "Kuvvet", lastOutcome: "struggled", status: "learning",
             successfulReviews: 0,
             outcomeHistory: { solvedCount: 0, struggledCount: 4, againCount: 0, knownOutcomeCount: 4 } }),
    ]);
    expect(story.moments.length).toBeGreaterThan(0);
    for (const moment of story.moments) {
      expect(moment.evidence.total).toBeGreaterThan(0);
      expect(["strong", "moderate"]).toContain(moment.evidenceLevel);
    }
  });

  it("never emits a numeric score, grade or percentage", () => {
    const story = buildStudentLearningStory([
      item({ outcomeHistory: { solvedCount: 8, struggledCount: 2, againCount: 0, knownOutcomeCount: 10 } }),
    ]);
    expect(allCopy(story)).not.toMatch(/%/);
    expect(allCopy(story)).not.toMatch(/\/100|puan|skor|seviye/i);
  });
});

describe("buildStudentLearningStory — temporal honesty", () => {
  // No per-outcome timestamps exist, so any of these phrases would be an
  // unprovable claim regardless of how the data happens to look.
  // Matched as whole words: Turkish second-person past tense ("çözdün")
  // legitimately ends in "-dün", so a substring check would fire on correct
  // copy. Unicode-aware boundaries, since \b does not understand "ü".
  const FORBIDDEN = [
    /(^|[^\p{L}])bu hafta([^\p{L}]|$)/u,
    /(^|[^\p{L}])geçen hafta([^\p{L}]|$)/u,
    /(^|[^\p{L}])son 7 gün([^\p{L}]|$)/u,
    /(^|[^\p{L}])bugün([^\p{L}]|$)/u,
    /(^|[^\p{L}])dün([^\p{L}]|$)/u,
    /(^|[^\p{L}])daha iyi([^\p{L}]|$)/u,
    /%/,
  ];

  it("never uses time-window language", () => {
    const story = buildStudentLearningStory([
      item({ questionId: "a", lastOutcome: "solved", successfulReviews: 2,
             outcomeHistory: { solvedCount: 5, struggledCount: 3, againCount: 0, knownOutcomeCount: 8 } }),
      item({ questionId: "b", subject: "Fizik", topic: "Kuvvet", lastOutcome: "struggled", status: "learning",
             successfulReviews: 0,
             outcomeHistory: { solvedCount: 0, struggledCount: 4, againCount: 0, knownOutcomeCount: 4 } }),
    ]);
    const copy = allCopy(story).toLocaleLowerCase("tr");
    for (const pattern of FORBIDDEN) expect(copy).not.toMatch(pattern);
  });
});

describe("buildStudentLearningStory — copy safety", () => {
  it("never leaks internal classifier or field names", () => {
    const story = buildStudentLearningStory([
      item({ questionId: "a", lastOutcome: "solved", successfulReviews: 2,
             outcomeHistory: { solvedCount: 2, struggledCount: 3, againCount: 0, knownOutcomeCount: 5 } }),
      item({ questionId: "b", subject: "Fizik", topic: "Kuvvet", lastOutcome: "struggled", status: "learning",
             successfulReviews: 0,
             outcomeHistory: { solvedCount: 0, struggledCount: 4, againCount: 0, knownOutcomeCount: 4 } }),
    ]);
    const copy = allCopy(story);
    for (const leak of [
      "persistent_struggle", "one_off_struggle", "insufficient_data", "recovering", "stable",
      "struggledCount", "solvedCount", "againCount", "successfulReviews",
    ]) {
      expect(copy).not.toContain(leak);
    }
  });
});

describe("buildStudentLearningStory — claim scope", () => {
  it("never attributes a topic-wide count to a single question", () => {
    // 8 struggles on one question and 2 on another is "10 in this topic",
    // never "10 on the same question".
    const story = buildStudentLearningStory([
      item({ questionId: "a", lastOutcome: "struggled", status: "learning", successfulReviews: 0,
             outcomeHistory: { solvedCount: 2, struggledCount: 8, againCount: 0, knownOutcomeCount: 10 } }),
      item({ questionId: "b", lastOutcome: "struggled", status: "learning", successfulReviews: 0,
             outcomeHistory: { solvedCount: 0, struggledCount: 2, againCount: 0, knownOutcomeCount: 2 } }),
    ]);
    const moment = story.moments[0]!;
    expect(moment.description).toContain("Bu konuda 10 kez");
    expect(moment.description).not.toContain("Aynı soruda");
  });

  it("reports the most recently reviewed attempt as the last one", () => {
    const story = buildStudentLearningStory([
      item({ questionId: "old", lastOutcome: "struggled", status: "learning", successfulReviews: 0,
             lastReviewedAt: 1_000,
             outcomeHistory: { solvedCount: 0, struggledCount: 5, againCount: 0, knownOutcomeCount: 5 } }),
      item({ questionId: "new", lastOutcome: "again", status: "learning", successfulReviews: 0,
             lastReviewedAt: 9_000,
             outcomeHistory: { solvedCount: 0, struggledCount: 4, againCount: 0, knownOutcomeCount: 4 } }),
    ]);
    // Both are persistent_struggle, so both contribute; the newer timestamp
    // decides what "son deneme" refers to.
    expect(story.moments[0]!.lastOutcome).toBe("again");
  });
});

describe("buildStudentLearningStory — state mapping", () => {
  it("tells a recovery story when a struggle history ends in a standing solve", () => {
    const story = buildStudentLearningStory([
      item({ lastOutcome: "solved", status: "review", successfulReviews: 1,
             outcomeHistory: { solvedCount: 1, struggledCount: 3, againCount: 0, knownOutcomeCount: 4 } }),
    ]);
    expect(story.moments[0]!.kind).toBe("recovery");
    expect(story.moments[0]!.description).toContain("3 kez");
  });

  it("flags repeated struggle as needing attention, with an action", () => {
    const story = buildStudentLearningStory([
      item({ lastOutcome: "struggled", status: "learning", successfulReviews: 0,
             outcomeHistory: { solvedCount: 0, struggledCount: 4, againCount: 0, knownOutcomeCount: 4 } }),
    ]);
    const moment = story.moments[0]!;
    expect(moment.kind).toBe("needs_attention");
    expect(moment.action).not.toBeNull();
    expect(moment.action!.topic).toBe("Denklemler");
  });

  it("does not dramatize a single slip", () => {
    const story = buildStudentLearningStory([
      item({ lastOutcome: "struggled", status: "learning", successfulReviews: 0,
             outcomeHistory: { solvedCount: 2, struggledCount: 1, againCount: 0, knownOutcomeCount: 3 } }),
    ]);
    expect(story.moments[0]!.kind).toBe("one_off");
    expect(story.moments[0]!.action).toBeNull();
  });

  it("produces no moment at all for insufficient evidence", () => {
    const story = buildStudentLearningStory([
      item({ status: "learning", lastOutcome: "solved", successfulReviews: 0,
             outcomeHistory: { solvedCount: 1, struggledCount: 0, againCount: 0, knownOutcomeCount: 1 } }),
    ]);
    expect(story.moments).toHaveLength(0);
    expect(story.isFirstRun).toBe(true);
  });
});

describe("buildStudentLearningStory — shape", () => {
  it("returns the first-run story for a student with no history", () => {
    const story = buildStudentLearningStory([]);
    expect(story.isFirstRun).toBe(true);
    expect(story.moments).toHaveLength(0);
    expect(story.headline).toContain("ilk çalışmalarınla");
  });

  it("emits one moment per topic, not one per question", () => {
    const story = buildStudentLearningStory([
      item({ questionId: "a", lastOutcome: "struggled", status: "learning", successfulReviews: 0,
             outcomeHistory: { solvedCount: 0, struggledCount: 3, againCount: 0, knownOutcomeCount: 3 } }),
      item({ questionId: "b", lastOutcome: "struggled", status: "learning", successfulReviews: 0,
             outcomeHistory: { solvedCount: 0, struggledCount: 4, againCount: 0, knownOutcomeCount: 4 } }),
    ]);
    expect(story.moments).toHaveLength(1);
    expect(story.moments[0]!.topic).toBe("Denklemler");
  });

  it("leads with progress and never with struggle", () => {
    const story = buildStudentLearningStory([
      item({ questionId: "a", subject: "Fizik", topic: "Kuvvet", lastOutcome: "struggled",
             status: "learning", successfulReviews: 0,
             outcomeHistory: { solvedCount: 0, struggledCount: 4, againCount: 0, knownOutcomeCount: 4 } }),
      item({ questionId: "b", lastOutcome: "solved", status: "review", successfulReviews: 1,
             outcomeHistory: { solvedCount: 1, struggledCount: 3, againCount: 0, knownOutcomeCount: 4 } }),
    ]);
    expect(story.moments[0]!.kind).toBe("recovery");
    expect(story.moments[1]!.kind).toBe("needs_attention");
  });

  it("caps the story instead of listing every topic", () => {
    const many = Array.from({ length: MAX_STORY_MOMENTS + 4 }, (_, i) =>
      item({ questionId: `q${i}`, topic: `Konu ${i}`, lastOutcome: "struggled", status: "learning",
             successfulReviews: 0,
             outcomeHistory: { solvedCount: 0, struggledCount: 3 + i, againCount: 0, knownOutcomeCount: 3 + i } }),
    );
    expect(buildStudentLearningStory(many).moments).toHaveLength(MAX_STORY_MOMENTS);
  });

  it("is deterministic — same input, same order, regardless of input order", () => {
    const items = [
      item({ questionId: "a", topic: "A", lastOutcome: "struggled", status: "learning", successfulReviews: 0,
             outcomeHistory: { solvedCount: 0, struggledCount: 3, againCount: 0, knownOutcomeCount: 3 } }),
      item({ questionId: "b", topic: "B", lastOutcome: "solved", status: "review", successfulReviews: 1,
             outcomeHistory: { solvedCount: 1, struggledCount: 3, againCount: 0, knownOutcomeCount: 4 } }),
      item({ questionId: "c", topic: "C", lastOutcome: "struggled", status: "learning", successfulReviews: 0,
             outcomeHistory: { solvedCount: 0, struggledCount: 5, againCount: 0, knownOutcomeCount: 5 } }),
    ];
    const forward = buildStudentLearningStory(items).moments.map((m) => m.id);
    const reversed = buildStudentLearningStory([...items].reverse()).moments.map((m) => m.id);
    expect(reversed).toEqual(forward);
  });

  it("skips items whose subject/topic metadata never resolved", () => {
    const story = buildStudentLearningStory([
      item({ subject: "", topic: "", lastOutcome: "struggled", status: "learning", successfulReviews: 0,
             outcomeHistory: { solvedCount: 0, struggledCount: 4, againCount: 0, knownOutcomeCount: 4 } }),
    ]);
    expect(story.moments).toHaveLength(0);
  });
});
