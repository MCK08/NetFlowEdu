import { readFileSync } from "fs";
import { join } from "path";

import type { StudentAssignmentCard } from "../../src/features/assignments/hooks/useStudentAssignments";
import { buildFeedItems, reconcileFeedItems, reinjectPairForSecondChance } from "../../src/features/classes/services/feedItems";
import {
  assignedQuestionIds,
  composeFeedOrder,
  MAX_CONSECUTIVE_SAME_TOPIC,
  MAX_CONSECUTIVE_STRUGGLE,
  withAssignmentSignals,
} from "../../src/features/feed/services/feedComposition";
import {
  activeFeedFilterCount,
  EMPTY_FEED_FILTER,
  feedFilterKey,
  filterQuestions,
  isFeedFilterActive,
  questionKindOf,
} from "../../src/features/feed/services/feedFilters";
import { buildFeedLaunchParams, FEED_LAUNCH_ROUTE, parseFeedLaunch } from "../../src/features/feed/services/feedLaunch";
import { buildQuestionFeedRanking, QuestionSignal, tierOf } from "../../src/features/feed/services/feedRanking";
import type { Question } from "../../src/types/question";

// Phase 109 — the question-first feed.
//
// Pins: the personal priority order (due → struggled → assigned → weak →
// discovery → developed) with the spreading pass on top; the kind filter and
// the clear path; the launch context Çalış hands the feed; the rating
// policy (inline multiple-choice answers get no second rating page); and,
// at source level, that the page hosts the ONE answer engine and shows no
// invented number.

const ROOT = join(__dirname, "..", "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");
const code = (relative: string) =>
  read(relative)
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
    .join("\n");

function q(id: string, overrides: Partial<Question> = {}): Question {
  return {
    id,
    ownerId: "teacher-1",
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
    choiceFeedback: null,
    ...overrides,
  };
}

const MC = { choices: { A: "1", B: "2", C: "3" }, correctChoice: "A" as const };

function signal(overrides: Partial<QuestionSignal> = {}): QuestionSignal {
  return { isDue: false, lastOutcome: null, masteryBand: null, recency: null, ...overrides };
}

function card(id: string, questionIds: string[], status: StudentAssignmentCard["status"] = "not_started"): StudentAssignmentCard {
  return { assignment: { id, questionIds } as StudentAssignmentCard["assignment"], submission: null, status };
}

describe("priority — personal evidence first", () => {
  it("ranks due, then struggled, then assigned, then weak topic, then discovery, then developed", () => {
    expect(tierOf(signal({ isDue: true }))).toBe(0);
    expect(tierOf(signal({ lastOutcome: "struggled" }))).toBe(1);
    expect(tierOf(signal({ isAssigned: true }))).toBe(2);
    expect(tierOf(signal({ masteryBand: "shaky" }))).toBe(3);
    expect(tierOf(signal())).toBe(4);
    expect(tierOf(signal({ masteryBand: "strong" }))).toBe(5);
    // A pre-Phase-109 signal (no isAssigned) ranks exactly as before.
    expect(tierOf({ isDue: false, lastOutcome: null, masteryBand: "learning", recency: null })).toBe(3);
  });

  it("an unresolved (struggled) question enters ahead of everything but a due one", () => {
    const signals = new Map([
      ["due", signal({ isDue: true })],
      ["unresolved", signal({ lastOutcome: "struggled" })],
      ["assigned", signal({ isAssigned: true })],
    ]);
    const ranked = buildQuestionFeedRanking({
      questions: [q("new"), q("assigned"), q("unresolved"), q("due")],
      signalsByQuestionId: signals,
      recentlyShownIds: new Set(),
    });
    expect(ranked.map((x) => x.id)).toEqual(["due", "unresolved", "assigned", "new"]);
  });

  it("assignment signals come from OPEN assignments only and never invent a study item", () => {
    const ids = assignedQuestionIds([card("a", ["q1", "q2"]), card("b", ["q3"], "completed")]);
    expect([...ids]).toEqual(["q1", "q2"]);
    const merged = withAssignmentSignals(new Map([["q1", signal({ isDue: true })]]), ids);
    expect(merged.get("q1")).toEqual(signal({ isDue: true, isAssigned: true }));
    expect(merged.get("q2")).toEqual(signal({ isAssigned: true }));
    expect(merged.has("q3")).toBe(false);
  });

  it("community difficulty is not an input to the feed order at all", () => {
    const ranking = code("src/features/feed/services/feedRanking.ts");
    const composition = code("src/features/feed/services/feedComposition.ts");
    const screen = code("src/features/feed/screens/FeedScreen.tsx");
    for (const source of [ranking, composition, screen]) {
      expect(source).not.toMatch(/communityBand|questionStats|CommunityBand/);
    }
  });
});

describe("spreading — an intentional mix, not a shuffle", () => {
  it("drops immediate duplicates and keeps ids stable", () => {
    const out = composeFeedOrder([q("a"), q("a"), q("b"), q("a")], new Map());
    expect(out.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("brings a different topic forward after the same-topic limit", () => {
    const questions = [
      q("m1", { topic: "Denklemler" }),
      q("m2", { topic: "Denklemler" }),
      q("m3", { topic: "Denklemler" }),
      q("f1", { subject: "Fizik", topic: "Kuvvet" }),
    ];
    const out = composeFeedOrder(questions, new Map()).map((x) => x.id);
    expect(MAX_CONSECUTIVE_SAME_TOPIC).toBe(2);
    expect(out).toEqual(["m1", "m2", "f1", "m3"]);
  });

  it("does not let the feed become a wall of struggle questions", () => {
    const struggled = ["s1", "s2", "s3", "s4", "s5"].map((id, i) => q(id, { topic: `T${i}` }));
    const signals = new Map(struggled.map((x) => [x.id, signal({ lastOutcome: "struggled" })] as const));
    const ranked = buildQuestionFeedRanking({
      questions: [...struggled, q("new", { topic: "Yeni" })],
      signalsByQuestionId: signals,
      recentlyShownIds: new Set(),
    });
    const out = composeFeedOrder(ranked, signals).map((x) => x.id);
    expect(MAX_CONSECUTIVE_STRUGGLE).toBe(3);
    expect(out.slice(0, 4)).toEqual(["s1", "s2", "s3", "new"]);
    expect(out).toHaveLength(6);
  });

  it("never drops or adds a question and is deterministic", () => {
    const questions = ["a", "b", "c", "d"].map((id) => q(id));
    const first = composeFeedOrder(questions, new Map());
    const second = composeFeedOrder(questions, new Map());
    expect(first.map((x) => x.id).sort()).toEqual(["a", "b", "c", "d"]);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

describe("filters", () => {
  it("filters by question kind, read from the question's own choices", () => {
    const mc = q("mc", MC);
    const open = q("open");
    expect(questionKindOf(mc)).toBe("multiple_choice");
    expect(questionKindOf(open)).toBe("open");
    expect(filterQuestions([mc, open], { ...EMPTY_FEED_FILTER, kind: "multiple_choice" }).map((x) => x.id)).toEqual(["mc"]);
    expect(filterQuestions([mc, open], { ...EMPTY_FEED_FILTER, kind: "open" }).map((x) => x.id)).toEqual(["open"]);
  });

  it("subject and topic still narrow, clearing returns the whole pool, and the kind is part of the session key", () => {
    const pool = [q("a"), q("b", { subject: "Fizik", topic: "Kuvvet" }), q("c", { topic: "Geometri" })];
    expect(filterQuestions(pool, { ...EMPTY_FEED_FILTER, subject: "Matematik" }).map((x) => x.id)).toEqual(["a", "c"]);
    expect(filterQuestions(pool, { ...EMPTY_FEED_FILTER, subject: "Matematik", topic: "Geometri" }).map((x) => x.id)).toEqual(["c"]);
    expect(filterQuestions(pool, EMPTY_FEED_FILTER)).toHaveLength(3);
    expect(isFeedFilterActive({ ...EMPTY_FEED_FILTER, kind: "open" })).toBe(true);
    expect(activeFeedFilterCount({ ...EMPTY_FEED_FILTER, subject: "Fizik", kind: "open" })).toBe(2);
    expect(feedFilterKey({ ...EMPTY_FEED_FILTER, kind: "open" })).not.toBe(feedFilterKey(EMPTY_FEED_FILTER));
  });

  it("a zero-result filter shows the exact sentence with a clear action; a truly empty feed does not", () => {
    const screen = read("src/features/feed/screens/FeedScreen.tsx");
    expect(screen).toContain('export const FEED_FILTER_EMPTY_TITLE = "Bu filtreyle eşleşen soru bulunamadı.";');
    const start = screen.indexOf("const emptyState =");
    const filtered = screen.slice(start, screen.indexOf(") : (", start));
    expect(filtered).toContain("FEED_FILTER_EMPTY_TITLE");
    expect(filtered).toContain('label="Filtreleri Temizle"');
  });

  // Phase 116 — SubjectPillBar became FeedScopeBar: the same subject
  // taxonomy, now behind Phase 50's channels, so "Derslerim" is a pill
  // instead of three taps through the filter sheet. Both still come from
  // canonical sources, and neither invents a category.
  it("the first-level pills are the product's real channels and subject taxonomy, and there is no exam filter", () => {
    const screen = code("src/features/feed/screens/FeedScreen.tsx");
    expect(screen).toContain("subjects={QUESTION_SUBJECTS}");
    expect(screen).toContain("channels={channels}");
    const bar = code("src/features/feed/components/FeedScopeBar.tsx");
    // The channel list is the role's own, never one assembled in the bar.
    expect(bar).toContain("channels.map");
    expect(bar).not.toMatch(/const CHANNELS|"Sana Özel"|"Derslerim"/);
    const sheet = code("src/features/feed/components/FeedFilterSheet.tsx");
    for (const source of [screen, sheet, code("src/features/feed/components/QuestionFeedPage.tsx")]) {
      expect(source).not.toMatch(/\bTYT\b|\bAYT\b|\bLGS\b|exam/i);
    }
  });
});

describe("launch context from Çalış", () => {
  it("round-trips subject, topic, kind and source through the tab's params", () => {
    const params = buildFeedLaunchParams(
      { filter: { subject: "Fizik", topic: "Kuvvet", gradeLevel: null, kind: "open" }, channel: "struggles" },
      42,
    );
    expect(params).toEqual({ launch: "42", subject: "Fizik", topic: "Kuvvet", kind: "open", channel: "struggles" });
    expect(parseFeedLaunch(params, "student")).toEqual({
      nonce: "42",
      context: { filter: { subject: "Fizik", topic: "Kuvvet", gradeLevel: null, kind: "open" }, channel: "struggles" },
    });
    expect(FEED_LAUNCH_ROUTE).toBe("/(student)/(tabs)");
  });

  it("ignores a plain visit, an unknown kind and a channel the role cannot use", () => {
    expect(parseFeedLaunch({}, "student")).toBeNull();
    const parsed = parseFeedLaunch({ launch: "1", kind: "essay", channel: "my_content" }, "student");
    expect(parsed?.context.filter.kind).toBeNull();
    expect(parsed?.context.channel).toBeNull();
  });
});

describe("rating policy — one outcome per answer", () => {
  it("builds no rating page after a multiple-choice question, and keeps one after an open-ended question", () => {
    const policy = (question: Question) => question.choices === null;
    const items = buildFeedItems([q("mc", MC), q("open")], 0, policy);
    expect(items.map((item) => `${item.type}:${item.question.id}`)).toEqual(["question:mc", "question:open", "rating:open"]);
    expect(reconcileFeedItems([], [q("mc", MC), q("open")], policy).map((item) => item.type)).toEqual(["question", "question", "rating"]);
  });

  it("a second-chance reshow respects the same policy", () => {
    const policy = (question: Question) => question.choices === null;
    const base = buildFeedItems([q("mc", MC), q("open")], 0, policy);
    const withMc = reinjectPairForSecondChance(base, q("mc", MC), 0, base.length, policy);
    expect(withMc.slice(base.length).map((item) => item.type)).toEqual(["question"]);
    const withOpen = reinjectPairForSecondChance(base, q("open"), 1, base.length, policy);
    expect(withOpen.slice(base.length).map((item) => item.type)).toEqual(["question", "rating"]);
    // Default (boolean) behaviour is unchanged for every other caller.
    expect(reinjectPairForSecondChance(base, q("mc", MC), 0, base.length).slice(base.length).map((i) => i.type)).toEqual([
      "question",
      "rating",
    ]);
  });

  it("the feed applies that policy and the same interleave engine as before", () => {
    const screen = read("src/features/feed/screens/FeedScreen.tsx");
    expect(screen).toContain("ratingPolicy,");
    expect(screen).toContain("useInterleavedStudyFeed({");
    expect(screen).toContain("handleInlineOutcome(outcome, question, index, item.questionIndex)");
    expect(screen).toContain("<RatingCard");
  });
});

describe("the page — one engine, no invented numbers", () => {
  const PAGE = "src/features/feed/components/QuestionFeedPage.tsx";

  it("hosts the canonical answer, hint and answer-screen paths and never a second one", () => {
    const page = code(PAGE);
    expect(page).toContain('import { MultipleChoiceAnswer } from "@features/questions/components/MultipleChoiceAnswer";');
    expect(page).toContain('import { QuestionHintLadder } from "@features/questions/components/QuestionHintLadder";');
    expect(page).toContain('pathname: "/(student)/answer/[questionId]"');
    expect(page).not.toMatch(/evaluateChoice|recordStudyOutcome|StudyOutcomeControls|useStudyQuestionState|correctChoice ===/);
    // The inline outcome is the bridge's own, handed up — never re-decided.
    expect(page).toContain("onOutcomeRecorded={(outcome) => onOutcomeRecorded(outcome, question)}");
    expect(code("src/features/questions/components/MultipleChoiceAnswer.tsx")).toContain("onOutcomeRecorded?.(outcome);");
  });

  it("shows only counts the document carries, and no finite progress of its own", () => {
    const page = code(PAGE);
    expect(page).toMatch(/count=\{likeCount\}/);
    expect(page).toMatch(/count=\{question\.commentCount\}/);
    expect(page).not.toMatch(/\d+[.,]\d+\s*[BKM]\b|solvedCount|saveCount|\/\s*10\b/);
    const screen = code("src/features/feed/screens/FeedScreen.tsx");
    // The only progress line is the real daily goal, and only when one exists.
    expect(screen).toContain("summary.dailyGoal > 0 ? `Bugünkü hedef ${summary.reviewedToday} / ${summary.dailyGoal}` : null");
  });

  it("keeps the community signal to one quiet sentence, never a percentage or a name", () => {
    const page = code(PAGE);
    expect(page).toContain('export const COMMUNITY_FEED_SENTENCE = "Bu soru toplulukta da zorlayıcı.";');
    expect(page).toContain('community?.band === "challenging"');
    // "100%" is a layout width; a rendered percentage would be text inside a Text.
    expect(page).not.toMatch(/cohortSize|yüzde|OWN_RELATION|\$\{[^}]*\}\s*%/);
  });

  it("every action does something real, and swiping is never the only way forward", () => {
    const page = code(PAGE);
    expect(page).toContain("useSavedQuestion(question, uid)");
    expect(page).toContain("toggleSaved");
    expect(page).toContain("onPress={openDetail}");
    expect(page).toContain('label="Sonraki"');
    expect(page).toContain("accessibilityState={{ selected: active }}");
    expect(page).toContain("minHeight: minTouchTarget");
  });

  it("speaks calmly: no AI claim, no exam, no rank, no emoji icon, theme tokens only", () => {
    for (const file of [PAGE, "src/features/feed/screens/FeedScreen.tsx", "src/features/feed/components/FeedScopeBar.tsx"]) {
      const source = code(file);
      expect(source).not.toMatch(/Yapay zek|AI |sıralama|liderlik|percentile|leaderboard/i);
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|"white"|"black"/);
      expect(source).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2705}\u{2728}]/u);
      expect(source.match(/fontSize:\s*\d+/g) ?? []).toEqual([]);
    }
  });

  it("loads questions only through the existing authorised paths", () => {
    const screen = code("src/features/feed/screens/FeedScreen.tsx");
    expect(screen).toContain("useSocialFeed(uid)");
    expect(screen).toContain("useClassScopedQuestions(");
    expect(screen).not.toMatch(/collection\(|getDocs\(|collectionGroup/);
    // The pager is the bounded window it always was.
    expect(screen).toContain("windowSize={3}");
    expect(screen).toContain("pagingEnabled");
  });
});
