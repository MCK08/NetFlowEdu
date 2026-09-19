import { readFileSync } from "fs";
import { join } from "path";

import type { StudyItem } from "../../src/features/study/services/studyService";
import { buildLearningState } from "../../src/features/study/services/learningState";
import type { LearningEvent } from "../../src/features/learningStory/services/learningTrail";
import type { Question } from "../../src/types/question";
import {
  buildAnalyticsOverview,
  buildQuestionArchive,
  buildQuestionTypeAnalysis,
  buildSubjectAnalysis,
  buildTopicDetail,
  buildTopicTimeline,
  filterArchive,
  filterItemsByRange,
  hasStruggleEvidence,
  resolveArchiveState,
  summarizeArchive,
  toAnalyticsItem,
  UNKNOWN_SUBJECT_LABEL,
} from "../../src/features/studentAnalytics/services/studentAnalytics";
import {
  archiveContextSentence,
  archiveEmptyCopy,
  archiveEntryDescription,
  archiveStruggleFact,
  overviewNarrative,
  successRateSentence,
  successRateValue,
  topicTimelineSentence,
} from "../../src/features/studentAnalytics/services/analyticsPresentation";

// Phase 107 — Kişisel Analiz + "Çözemediğim Sorular".
//
// Pins the archive's evidence rules, the honesty of every aggregate, and that
// none of it redefines what the Phase 42 classifier already decides.

const ROOT = join(__dirname, "..", "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");

const NOW = Date.UTC(2026, 8, 18, 12, 0, 0);

/** Fails the test loudly when an expected row is missing, rather than letting
 *  an optional chain turn "nothing was produced" into a quiet pass. */
function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("expected a value, got undefined");
  return value;
}
const DAY = 24 * 60 * 60 * 1000;

function question(overrides: Partial<Question> = {}): Question {
  return {
    id: "q",
    ownerId: "teacher",
    organizationId: null,
    visibility: "class",
    imageUrl: "https://example.test/q.jpg",
    classId: "c1",
    subject: "Matematik",
    topic: "Denklemler",
    gradeLevel: "8",
    description: null,
    posterRole: "teacher",
    createdAt: 0,
    likeCount: 0,
    commentCount: 0,
    answerCount: 0,
    choices: null,
    correctChoice: null,
    hints: [],
    choiceFeedback: null,
    ...overrides,
  };
}

const MC = { choices: { A: "1", B: "2", C: "3" }, correctChoice: "A" as const };

/** A study item whose counters cover its whole history (Phase 41 complete). */
function item(
  questionId: string,
  counts: { solved: number; struggled: number; again: number },
  overrides: Partial<StudyItem> = {},
): StudyItem {
  return {
    questionId,
    status: "learning",
    lastOutcome: "solved",
    intervalDays: 1,
    successfulReviews: 0,
    attemptCount: counts.solved + counts.struggled + counts.again,
    nextReviewAt: NOW + DAY,
    lastReviewedAt: NOW - DAY,
    source: "class",
    sourceClassId: "c1",
    solvedCount: counts.solved,
    struggledCount: counts.struggled,
    againCount: counts.again,
    ...overrides,
  };
}

/** A pre-Phase-41 item: attempts exist, counters never did. */
function legacy(questionId: string, overrides: Partial<StudyItem> = {}): StudyItem {
  return {
    questionId,
    status: "learning",
    lastOutcome: "struggled",
    intervalDays: 1,
    successfulReviews: 0,
    attemptCount: 4,
    nextReviewAt: NOW + DAY,
    lastReviewedAt: NOW - DAY,
    source: "public",
    sourceClassId: null,
    solvedCount: null,
    struggledCount: null,
    againCount: null,
    ...overrides,
  };
}

describe("A — archive inclusion", () => {
  it("includes a question with a recorded struggle, as waiting", () => {
    const a = toAnalyticsItem(item("q1", { solved: 0, struggled: 1, again: 0 }, { lastOutcome: "struggled" }), question());
    expect(hasStruggleEvidence(a)).toBe(true);
    expect(resolveArchiveState(a)).toBe("pending");
  });

  it("includes a wrong multiple-choice answer, which is recorded as struggled", () => {
    const a = toAnalyticsItem(
      item("q2", { solved: 0, struggled: 1, again: 0 }, { lastOutcome: "struggled" }),
      question({ id: "q2", ...MC }),
    );
    expect(resolveArchiveState(a)).toBe("pending");
    expect(a.questionKind).toBe("multiple_choice");
  });

  it("keeps a question waiting while its latest outcome is not a solve", () => {
    const a = toAnalyticsItem(item("q3", { solved: 1, struggled: 1, again: 1 }, { lastOutcome: "again" }), question());
    expect(resolveArchiveState(a)).toBe("pending");
  });

  it("includes a legacy item only on the one outcome it still carries", () => {
    const a = toAnalyticsItem(legacy("q4", { lastOutcome: "struggled" }), question());
    expect(a.outcomeHistory).toBeNull();
    expect(resolveArchiveState(a)).toBe("pending");
  });
});

describe("B — archive exclusion", () => {
  it("never archives a question that was only ever solved", () => {
    const a = toAnalyticsItem(item("q1", { solved: 3, struggled: 0, again: 0 }), question());
    expect(resolveArchiveState(a)).toBeNull();
  });

  it("does not treat 'Tekrar Et' as proof of difficulty", () => {
    // `again` is a request to see a card again soon — pressed on solved
    // questions too — so an again-only history is not an unsolved question.
    const a = toAnalyticsItem(item("q2", { solved: 1, struggled: 0, again: 2 }, { lastOutcome: "again" }), question());
    expect(resolveArchiveState(a)).toBeNull();
  });

  it("does not archive a legacy item whose defaulted outcome reads 'again'", () => {
    // studyService DEFAULTS a missing lastOutcome to "again".
    const a = toAnalyticsItem(legacy("q3", { lastOutcome: "again" }), question());
    expect(resolveArchiveState(a)).toBeNull();
  });

  it("does not archive a legacy item that was last solved — earlier difficulty is unprovable", () => {
    const a = toAnalyticsItem(legacy("q4", { lastOutcome: "solved" }), question());
    expect(resolveArchiveState(a)).toBeNull();
  });

  it("never archives by topic or subject: a struggling topic does not pull in its solved questions", () => {
    const items = [
      toAnalyticsItem(item("hard", { solved: 0, struggled: 3, again: 0 }, { lastOutcome: "struggled" }), question({ id: "hard" })),
      toAnalyticsItem(item("fine", { solved: 3, struggled: 0, again: 0 }), question({ id: "fine" })),
    ];
    expect(buildQuestionArchive(items).map((entry) => entry.questionId)).toEqual(["hard"]);
  });
});

describe("C — solved later stays in the archive", () => {
  it("marks a question solved later when a struggle is followed by a standing solve", () => {
    const a = toAnalyticsItem(
      item("q1", { solved: 1, struggled: 2, again: 0 }, { lastOutcome: "solved", successfulReviews: 1 }),
      question(),
    );
    expect(resolveArchiveState(a)).toBe("solved_later");
  });

  it("keeps its history: a later solve changes the state, it does not remove the question", () => {
    const before = toAnalyticsItem(item("q1", { solved: 0, struggled: 1, again: 0 }, { lastOutcome: "struggled" }), question());
    const after = toAnalyticsItem(item("q1", { solved: 1, struggled: 1, again: 0 }, { lastOutcome: "solved" }), question());
    expect(buildQuestionArchive([before])).toHaveLength(1);
    expect(buildQuestionArchive([after])).toHaveLength(1);
    expect(must(buildQuestionArchive([after])[0]).state).toBe("solved_later");
    expect(must(buildQuestionArchive([after])[0]).struggledCount).toBe(1);
  });

  it("never fabricates recovery for a legacy item", () => {
    const a = toAnalyticsItem(legacy("q2", { lastOutcome: "solved" }), question());
    expect(resolveArchiveState(a)).not.toBe("solved_later");
  });

  it("orders waiting questions before solved-later ones, newest first", () => {
    const entries = buildQuestionArchive([
      toAnalyticsItem(item("old", { solved: 0, struggled: 1, again: 0 }, { lastOutcome: "struggled", lastReviewedAt: NOW - 5 * DAY }), question({ id: "old" })),
      toAnalyticsItem(item("done", { solved: 1, struggled: 1, again: 0 }, { lastOutcome: "solved", lastReviewedAt: NOW }), question({ id: "done" })),
      toAnalyticsItem(item("new", { solved: 0, struggled: 1, again: 0 }, { lastOutcome: "struggled", lastReviewedAt: NOW - DAY }), question({ id: "new" })),
    ]);
    expect(entries.map((entry) => entry.questionId)).toEqual(["new", "old", "done"]);
  });
});

describe("D — insufficient data is never poor performance", () => {
  it("reports no rate (null), not 0, when no item has trustworthy history", () => {
    const overview = buildAnalyticsOverview([toAnalyticsItem(legacy("q1"), question())]);
    expect(overview.successRatePercent).toBeNull();
    expect(overview.knownOutcomeCount).toBe(0);
    expect(successRateValue(overview.successRatePercent)).toBe("—");
    expect(successRateSentence(null, 0)).toBe("Çözme oranı için henüz yeterli kayıt yok");
  });

  it("excludes untrustworthy items from the denominator instead of counting them as failures", () => {
    const overview = buildAnalyticsOverview([
      toAnalyticsItem(item("good", { solved: 3, struggled: 1, again: 0 }), question({ id: "good" })),
      toAnalyticsItem(legacy("old"), question({ id: "old" })),
    ]);
    expect(overview.successRatePercent).toBe(75);
    expect(overview.knownOutcomeCount).toBe(4);
  });

  it("says only what a legacy archive entry can prove", () => {
    const entry = must(buildQuestionArchive([toAnalyticsItem(legacy("q1"), question())])[0]);
    expect(entry.struggledCount).toBeNull();
    expect(archiveStruggleFact(entry)).toBe("Son denemende zorlandın");
    expect(archiveContextSentence(entry)).toBe("Bu soruda son denemende zorlanmıştın.");
  });

  it("leaves the classifier's insufficient_data verdict intact on thin evidence", () => {
    const a = toAnalyticsItem(item("q1", { solved: 1, struggled: 0, again: 0 }), question());
    expect(a.learningState).toBe("insufficient_data");
  });
});

describe("E — subjects", () => {
  const items = [
    toAnalyticsItem(item("m1", { solved: 2, struggled: 2, again: 0 }, { lastOutcome: "struggled" }), question({ id: "m1" })),
    toAnalyticsItem(item("m2", { solved: 3, struggled: 1, again: 0 }), question({ id: "m2", topic: "Kesirler" })),
    toAnalyticsItem(item("t1", { solved: 1, struggled: 0, again: 0 }), question({ id: "t1", subject: "Türkçe", topic: "Paragraf" })),
  ];

  it("aggregates counts, a completeness-safe rate and waiting archive items per subject", () => {
    const rows = buildSubjectAnalysis(items, NOW);
    const math = must(rows[0]);
    const turkish = must(rows[1]);
    expect(math.subject).toBe("Matematik");
    expect(math.questionCount).toBe(2);
    expect(math.knownOutcomeCount).toBe(8);
    expect(math.successRatePercent).toBe(63);
    expect(math.pendingArchiveCount).toBe(1);
    expect(math.topics.map((topic) => topic.topic).sort()).toEqual(["Denklemler", "Kesirler"]);
    expect(turkish.subject).toBe("Türkçe");
    expect(turkish.successRatePercent).toBe(100);
  });

  it("keeps questions with no subject apart from the REAL 'Diğer' subject", () => {
    const rows = buildSubjectAnalysis(
      [
        toAnalyticsItem(item("real", { solved: 1, struggled: 0, again: 0 }), question({ id: "real", subject: "Diğer", topic: "Genel" })),
        toAnalyticsItem(item("gone", { solved: 0, struggled: 1, again: 0 }, { lastOutcome: "struggled" }), null),
      ],
      NOW,
    );
    const real = rows.find((row) => row.subject === "Diğer");
    const unknown = rows.find((row) => row.isUnknownSubject);
    expect(real?.questionCount).toBe(1);
    expect(real?.isUnknownSubject).toBe(false);
    expect(real?.topics.map((topic) => topic.topic)).toEqual(["Genel"]);
    expect(unknown?.subject).toBe(UNKNOWN_SUBJECT_LABEL);
    expect(unknown?.questionCount).toBe(1);
    expect(unknown?.topics).toEqual([]);
    // Never dropped, always last.
    expect(rows[rows.length - 1]).toBe(unknown);
  });
});

describe("F — topics", () => {
  const items = [
    toAnalyticsItem(item("a", { solved: 0, struggled: 2, again: 0 }, { lastOutcome: "struggled", lastReviewedAt: NOW - 2 * DAY }), question({ id: "a" })),
    toAnalyticsItem(item("b", { solved: 1, struggled: 1, again: 0 }, { lastOutcome: "solved", lastReviewedAt: NOW - DAY }), question({ id: "b" })),
    toAnalyticsItem(item("c", { solved: 2, struggled: 0, again: 0 }), question({ id: "c", topic: "Kesirler" })),
  ];

  it("reads the topic through the Phase 70 concept node rather than a new rollup", () => {
    const detail = buildTopicDetail(items, "Matematik", "Denklemler", NOW);
    expect(detail?.questionCount).toBe(2);
    expect(detail?.node?.presentation).toBe("needs_attention");
    expect(detail?.node?.stateComposition.persistent_struggle).toBe(1);
    expect(detail?.archivePendingCount).toBe(1);
    expect(detail?.archiveSolvedLaterCount).toBe(1);
    expect(detail?.successRatePercent).toBe(25);
    expect(detail?.lastReviewedAt).toBe(NOW - DAY);
  });

  it("returns null for a topic the student has no questions in", () => {
    expect(buildTopicDetail(items, "Matematik", "Olasılık", NOW)).toBeNull();
    expect(buildTopicDetail(items, "", "", NOW)).toBeNull();
  });

  it("draws a timeline only from real events, in order, within the trail's own limits", () => {
    const event = (id: string, outcome: LearningEvent["outcome"], at: number, topic = "Denklemler"): LearningEvent => ({
      id,
      questionId: id,
      outcome,
      occurredAt: at,
      subject: "Matematik",
      topic,
    });
    const timeline = buildTopicTimeline(
      [
        event("e3", "solved", 30),
        event("e1", "struggled", 10),
        event("x", "solved", 20, "Kesirler"),
        event("e2", "again", 20),
      ],
      "Matematik",
      "Denklemler",
    );
    expect(timeline.steps).toEqual(["struggled", "again", "solved"]);
    expect(timeline.isSufficient).toBe(true);
    expect(topicTimelineSentence(timeline)).toBe(
      "Bu konudaki son 3 denemen, eskiden yeniye: Zorlandım, Tekrar Çalıştım, Çözdüm.",
    );

    const thin = buildTopicTimeline([event("only", "solved", 10)], "Matematik", "Denklemler");
    expect(thin.isSufficient).toBe(false);
    expect(topicTimelineSentence(thin)).toMatch(/yeterli deneme yok/);
  });
});

describe("G — question types", () => {
  it("reports only the formats the product persists, and only ones the student met", () => {
    const analysis = buildQuestionTypeAnalysis([
      toAnalyticsItem(item("mc", { solved: 1, struggled: 1, again: 0 }, { lastOutcome: "struggled" }), question({ id: "mc", ...MC })),
      toAnalyticsItem(item("gone", { solved: 1, struggled: 0, again: 0 }), null),
    ]);
    expect(analysis.rows.map((row) => row.kind)).toEqual(["multiple_choice"]);
    const row = must(analysis.rows[0]);
    expect(row.successRatePercent).toBe(50);
    expect(row.solvedCount).toBe(1);
    expect(row.pendingArchiveCount).toBe(1);
    expect(analysis.unresolvedCount).toBe(1);
    expect(analysis.totalCount).toBe(2);
  });

  it("classifies a question without valid choices as open-ended", () => {
    const open = toAnalyticsItem(item("o", { solved: 1, struggled: 0, again: 0 }), question({ id: "o" }));
    const oneChoice = toAnalyticsItem(
      item("x", { solved: 1, struggled: 0, again: 0 }),
      question({ id: "x", choices: { A: "only" }, correctChoice: null }),
    );
    expect(open.questionKind).toBe("open");
    expect(oneChoice.questionKind).toBe("open");
  });
});

describe("H — time range", () => {
  const items = [
    toAnalyticsItem(item("today", { solved: 1, struggled: 0, again: 0 }, { lastReviewedAt: NOW - 1000 }), question({ id: "today" })),
    toAnalyticsItem(item("week", { solved: 1, struggled: 0, again: 0 }, { lastReviewedAt: NOW - 10 * DAY }), question({ id: "week" })),
    toAnalyticsItem(item("old", { solved: 1, struggled: 0, again: 0 }, { lastReviewedAt: NOW - 60 * DAY }), question({ id: "old" })),
    toAnalyticsItem(item("undated", { solved: 1, struggled: 0, again: 0 }, { lastReviewedAt: 0 }), question({ id: "undated" })),
  ];

  it("selects questions by when they were last worked on", () => {
    const ids = (range: "7d" | "30d" | "all") => filterItemsByRange(items, range, NOW).map((a) => a.questionId);
    expect(ids("7d")).toEqual(["today"]);
    expect(ids("30d")).toEqual(["today", "week"]);
    expect(ids("all")).toEqual(["today", "week", "old", "undated"]);
  });

  it("never guesses an undated item into a recent window", () => {
    expect(filterItemsByRange(items, "30d", NOW).some((a) => a.questionId === "undated")).toBe(false);
  });
});

describe("I — missing metadata", () => {
  it("keeps the evidence of an unreadable question without inventing its content", () => {
    const a = toAnalyticsItem(item("gone", { solved: 0, struggled: 2, again: 0 }, { lastOutcome: "struggled" }), null);
    expect(a.isQuestionAvailable).toBe(false);
    expect(a.questionKind).toBeNull();
    expect(a.subject).toBe("");
    expect(a.imageUrl).toBeNull();
    expect(a.hints).toEqual([]);
    const entry = must(buildQuestionArchive([a])[0]);
    expect(entry.isQuestionAvailable).toBe(false);
    expect(entry.state).toBe("pending");
  });

  it("does not narrate a focus subject from unknown or single-question evidence", () => {
    expect(buildAnalyticsOverview([toAnalyticsItem(item("x", { solved: 1, struggled: 0, again: 0 }), null)]).focusSubject).toBeNull();
    expect(buildAnalyticsOverview([toAnalyticsItem(item("y", { solved: 1, struggled: 0, again: 0 }), question())]).focusSubject).toBeNull();
  });
});

describe("J — archive filters and empty states", () => {
  const entries = buildQuestionArchive([
    toAnalyticsItem(item("p", { solved: 0, struggled: 1, again: 0 }, { lastOutcome: "struggled" }), question({ id: "p" })),
    toAnalyticsItem(item("s", { solved: 1, struggled: 1, again: 0 }, { lastOutcome: "solved" }), question({ id: "s", topic: "Kesirler" })),
  ]);

  it("filters by state and by topic scope", () => {
    expect(filterArchive(entries, "pending").map((e) => e.questionId)).toEqual(["p"]);
    expect(filterArchive(entries, "solved_later").map((e) => e.questionId)).toEqual(["s"]);
    expect(filterArchive(entries, "all", { subject: "Matematik", topic: "Kesirler" }).map((e) => e.questionId)).toEqual(["s"]);
    expect(summarizeArchive(entries)).toEqual({ total: 2, pending: 1, solvedLater: 1 });
  });

  it("distinguishes 'no history yet' from 'nothing waiting' and never celebrates", () => {
    expect(archiveEmptyCopy({ total: 0, pending: 0, solvedLater: 0 }, "all", false).title).toBe(
      "Henüz arşivlenecek bir soru oluşmadı",
    );
    expect(archiveEmptyCopy({ total: 2, pending: 0, solvedLater: 2 }, "pending", false).title).toBe(
      "Şu anda tekrar bekleyen bir sorun yok",
    );
    for (const copy of [
      archiveEmptyCopy({ total: 0, pending: 0, solvedLater: 0 }, "all", true),
      archiveEmptyCopy({ total: 1, pending: 1, solvedLater: 0 }, "solved_later", false),
    ]) {
      expect(`${copy.title} ${copy.description}`).not.toMatch(/🎉|Tebrikler|Harika|mükemmel/i);
    }
    expect(archiveEntryDescription({ total: 3, pending: 2, solvedLater: 1 })).toBe("2 soru tekrar bakmak için bekliyor");
  });

  it("avoids shame vocabulary everywhere in the student-facing wording", () => {
    // Checked against CODE only: the file's comments quote the very phrases
    // it refuses to say ("never 'bu konuda zayıfsın'"), and documenting a
    // rule must never be the reason a test fails.
    const code = read("src/features/studentAnalytics/services/analyticsPresentation.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(code).not.toMatch(/Hatalarım|Başarısız|Yanlışlarım|zayıfsın|başaramadın/);
  });
});

describe("overview narrative", () => {
  it("names a clear focus subject without bolting a case suffix onto it", () => {
    const overview = buildAnalyticsOverview([
      toAnalyticsItem(item("a", { solved: 1, struggled: 0, again: 0 }), question({ id: "a", subject: "Fen Bilimleri" })),
      toAnalyticsItem(item("b", { solved: 1, struggled: 0, again: 0 }), question({ id: "b", subject: "Fen Bilimleri" })),
      toAnalyticsItem(item("c", { solved: 1, struggled: 0, again: 0 }), question({ id: "c", subject: "Türkçe" })),
    ]);
    expect(overviewNarrative(overview, "all")).toBe("En çok çalıştığın ders: Fen Bilimleri.");
  });

  it("stays silent on a tie rather than inventing a focus", () => {
    const overview = buildAnalyticsOverview([
      toAnalyticsItem(item("a", { solved: 1, struggled: 0, again: 0 }), question({ id: "a", subject: "Matematik" })),
      toAnalyticsItem(item("b", { solved: 1, struggled: 0, again: 0 }), question({ id: "b", subject: "Matematik" })),
      toAnalyticsItem(item("c", { solved: 1, struggled: 0, again: 0 }), question({ id: "c", subject: "Türkçe" })),
      toAnalyticsItem(item("d", { solved: 1, struggled: 0, again: 0 }), question({ id: "d", subject: "Türkçe" })),
    ]);
    expect(overview.focusSubject).toBeNull();
    expect(overviewNarrative(overview, "7d")).toBeNull();
  });
});

describe("M — the Phase 42 classifier is locked", () => {
  it("still returns its documented verdicts", () => {
    const h = (solved: number, struggled: number, again: number) => ({
      solvedCount: solved,
      struggledCount: struggled,
      againCount: again,
      knownOutcomeCount: solved + struggled + again,
    });
    expect(buildLearningState({ history: null, lastOutcome: "solved", status: "learning", successfulReviews: 1 })).toBe(
      "insufficient_data",
    );
    expect(buildLearningState({ history: h(3, 0, 0), lastOutcome: "solved", status: "learning", successfulReviews: 3 })).toBe("stable");
    expect(buildLearningState({ history: h(1, 5, 0), lastOutcome: "solved", status: "mastered", successfulReviews: 1 })).toBe("stable");
    expect(buildLearningState({ history: h(1, 1, 0), lastOutcome: "struggled", status: "learning", successfulReviews: 0 })).toBe(
      "one_off_struggle",
    );
    expect(buildLearningState({ history: h(1, 2, 0), lastOutcome: "solved", status: "learning", successfulReviews: 1 })).toBe("recovering");
    expect(buildLearningState({ history: h(1, 2, 0), lastOutcome: "struggled", status: "learning", successfulReviews: 0 })).toBe(
      "persistent_struggle",
    );
  });

  it("is only ever CALLED by Phase 107, never re-implemented", () => {
    const model = read("src/features/studentAnalytics/services/studentAnalytics.ts");
    expect(model).toContain("buildLearningState({");
    expect(model).toContain("buildConceptMasteryMap({");
    expect(model).not.toMatch(/REPEATED_STRUGGLE_MIN_EVENTS|MIN_OUTCOMES_FOR_CONFIDENT_STATE/);
    expect(model).not.toMatch(/return "(persistent_struggle|recovering|stable|one_off_struggle|insufficient_data)"/);
  });
});

// ─── Structural contracts (source-level, the style routeBackAudit uses) ────

const FEATURE = "src/features/studentAnalytics";
const featureSource = (relative: string) => read(`${FEATURE}/${relative}`);
const stripComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("K — routes", () => {
  it("is a nested reading under Profil, not a tab (Phase 109)", () => {
    const tabs = read("app/(student)/(tabs)/_layout.tsx");
    expect(tabs).not.toContain('name="analytics"');
    expect(tabs).not.toContain('title: "Analiz"');
    expect(read("src/features/studentAnalytics/routes.ts")).toContain('overview: "/(student)/analytics"');
    expect(read("src/features/studentAnalytics/screens/AnalyticsOverviewScreen.tsx")).toContain(
      "backFallbackHref={ROUTES.studentProfile}",
    );
  });

  it.each([
    ["app/(student)/analytics/index.tsx", "AnalyticsOverviewScreen"],
    ["app/(student)/analytics/subjects.tsx", "SubjectAnalysisScreen"],
    ["app/(student)/analytics/topic.tsx", "TopicDetailScreen"],
    ["app/(student)/analytics/question-types.tsx", "QuestionTypeAnalysisScreen"],
    ["app/(student)/analytics/archive/index.tsx", "QuestionArchiveScreen"],
    ["app/(student)/analytics/archive/[questionId].tsx", "ArchivedQuestionScreen"],
  ])("%s renders %s from the feature barrel", (route, screen) => {
    const source = read(route);
    expect(source).toContain(`import { ${screen} } from "@features/studentAnalytics";`);
    expect(read(`${FEATURE}/index.ts`)).toContain(`export { ${screen} } from "./screens/${screen}";`);
  });

  it("routes 'Tekrar Çöz' into the canonical question screen, and nowhere else", () => {
    const routes = featureSource("routes.ts");
    expect(routes).toMatch(/return `\/\(student\)\/question\/\$\{encodeURIComponent\(questionId\)\}`/);
    const screen = featureSource("screens/ArchivedQuestionScreen.tsx");
    expect(screen).toContain("router.push(questionSolvingRoute(questionId) as never)");
  });

  it("keeps analytics screens out of the auth guard's resolvable routes", () => {
    // ResolvedRoute is built from ROUTES' values; none of these screens is an
    // auth landing target, so none may widen that union.
    const routes = read("src/constants/routes.ts");
    expect(routes).not.toMatch(/analytics/);
  });

  it("does not regress the Phase 105 unmatched-route fallback", () => {
    expect(read("app/+not-found.tsx")).toContain("export default function NotFoundRoute");
  });
});

describe("no second solving engine", () => {
  it("never evaluates, schedules or writes an attempt of its own", () => {
    for (const file of [
      "screens/ArchivedQuestionScreen.tsx",
      "screens/QuestionArchiveScreen.tsx",
      "screens/TopicDetailScreen.tsx",
      "services/studentAnalytics.ts",
      "hooks/useStudentAnalytics.ts",
    ]) {
      const code = stripComments(featureSource(file));
      expect(code).not.toMatch(/recordStudyOutcome|evaluateChoice|mcResultToStudyOutcome|reviewScheduler/);
    }
  });

  it("records an open question's retry only through the canonical rating pair", () => {
    const code = stripComments(featureSource("screens/ArchivedQuestionScreen.tsx"));
    expect(code).toContain('import { StudyOutcomeControls, useStudyQuestionState } from "@features/study";');
    expect(code).toContain('isOpenQuestion = Boolean(item?.isQuestionAvailable && item.questionKind === "open")');
    // Multiple-choice questions record through the question screen's own
    // bridge, so the self-report is never offered for them as well.
    expect(code).toMatch(/\{isOpenQuestion \? \(/);
  });

  it("reuses the authored hint ladder rather than a copy", () => {
    expect(featureSource("screens/ArchivedQuestionScreen.tsx")).toContain(
      'import { QuestionHintLadder } from "@features/questions";',
    );
  });
});

describe("performance", () => {
  it("reads through the shared bounded path, never one question per row", () => {
    const hook = stripComments(featureSource("hooks/useStudentAnalytics.ts"));
    expect(hook).toContain("getAllStudyItems(uid)");
    expect(hook).toContain("resolveQuestionMetadata(");
    expect(hook).not.toMatch(/getQuestionById|getDoc\(|onSnapshot/);
  });

  it("virtualises the archive, which grows for the life of the account", () => {
    const screen = featureSource("screens/QuestionArchiveScreen.tsx");
    expect(screen).toContain("<FlatList");
    expect(screen).toContain("removeClippedSubviews");
  });
});

describe("L — accessibility", () => {
  it("exposes the filters as a radio group with a checked state, not colour alone", () => {
    const pills = featureSource("components/SegmentedPills.tsx");
    expect(pills).toContain('accessibilityRole="radiogroup"');
    expect(pills).toContain('accessibilityRole="radio"');
    expect(pills).toContain("accessibilityState={{ checked: selected }}");
    expect(pills).toContain("minHeight: minTouchTarget");
  });

  it("shows archive state as glyph AND words, with the words given a real colour", () => {
    const row = featureSource("components/ArchiveEntryRow.tsx");
    expect(row).toContain("<StatusLabel");
    // StatusLabel tints only its glyph; uncoloured words fall back to black.
    expect(row).toContain("toneTextColor(ARCHIVE_STATE_TONE[entry.state])");
  });

  it("gives the outcome timeline a sentence as its text alternative", () => {
    const topic = featureSource("screens/TopicDetailScreen.tsx");
    expect(topic).toContain("accessibilityLabel={topicTimelineSentence(timeline)}");
  });

  it("stacks paired layouts at the product's large-text threshold", () => {
    for (const file of [
      "screens/AnalyticsOverviewScreen.tsx",
      "screens/SubjectAnalysisScreen.tsx",
      "screens/TopicDetailScreen.tsx",
      "screens/QuestionTypeAnalysisScreen.tsx",
    ]) {
      expect(featureSource(file)).toContain("fontScale >= stackAtFontScale");
    }
  });

  it("hides decorative icons inside labelled controls", () => {
    for (const file of ["components/AnalyticsNavRow.tsx", "components/ArchiveEntryRow.tsx"]) {
      const icons = featureSource(file).match(/<Ionicons[\s\S]*?\/>/g) ?? [];
      expect(icons.length).toBeGreaterThan(0);
      for (const icon of icons) expect(icon).toContain("accessibilityElementsHidden");
    }
  });

  it("never scatters raw hex colours through the feature", () => {
    for (const file of [
      "components/SegmentedPills.tsx",
      "components/StatTile.tsx",
      "components/RateBar.tsx",
      "components/AnalyticsNavRow.tsx",
      "components/ArchiveEntryRow.tsx",
      "components/ArchiveFocusCard.tsx",
      "screens/AnalyticsOverviewScreen.tsx",
      "screens/SubjectAnalysisScreen.tsx",
      "screens/TopicDetailScreen.tsx",
      "screens/QuestionTypeAnalysisScreen.tsx",
      "screens/QuestionArchiveScreen.tsx",
      "screens/ArchivedQuestionScreen.tsx",
    ]) {
      expect(stripComments(featureSource(file))).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    }
  });
});

describe("design-system drift", () => {
  it("draws each topic verdict with Öğrenme Haritam's own glyph", () => {
    const map = read("src/features/study/components/ConceptMasteryMapView.tsx");
    const presentation = featureSource("services/analyticsPresentation.ts");
    for (const [state, icon] of [
      ["needs_attention", "repeat-outline"],
      ["recovering", "trending-up-outline"],
      ["watch", "flag-outline"],
      ["steady", "checkmark-circle-outline"],
      ["needs_evidence", "ellipse-outline"],
    ]) {
      expect(map).toContain(`${state}: "${icon}"`);
      expect(presentation).toContain(`${state}: "${icon}"`);
    }
  });
});

describe("N — no teacher or intervention semantics", () => {
  it("imports nothing from the teacher, assignment or intervention domains", () => {
    const files = [
      "services/studentAnalytics.ts",
      "services/analyticsPresentation.ts",
      "hooks/useStudentAnalytics.ts",
      "screens/AnalyticsOverviewScreen.tsx",
      "screens/SubjectAnalysisScreen.tsx",
      "screens/TopicDetailScreen.tsx",
      "screens/QuestionTypeAnalysisScreen.tsx",
      "screens/QuestionArchiveScreen.tsx",
      "screens/ArchivedQuestionScreen.tsx",
    ];
    for (const file of files) {
      const imports = featureSource(file).match(/from "[^"]+"/g) ?? [];
      for (const specifier of imports) {
        expect(specifier).not.toMatch(/features\/(teacher|assignments|dailyFlow)|intervention|effectiveness/);
      }
    }
  });
});
