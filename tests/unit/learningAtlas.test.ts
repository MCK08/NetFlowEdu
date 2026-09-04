// Phase 76 — the Atlas composition.
//
// The Atlas invents no meaning, so most of what matters here is proving that
// it CARRIES verdicts rather than recomputing them, and that it refuses to
// attach a focus, a motion trail or an edge it cannot justify.

import { LearningEvent } from "../../src/features/learningStory/services/learningTrail";
import {
  ATLAS_LENSES,
  ATLAS_MOTION_CAPTION,
  atlasEmptyLensCopy,
  atlasLensLabel,
  atlasSummaryFacts,
  buildLearningAtlas,
  filterAtlasRegions,
  LearningAtlas,
} from "../../src/features/study/services/learningAtlas";
import { LearningInsightItem } from "../../src/features/study/services/learningInsights";
import { StudentNextAction } from "../../src/features/study/services/studentNextAction";

const NOW = 1_700_000_000_000;
const FUTURE = NOW + 5 * 24 * 60 * 60 * 1000;
const PAST = NOW - 60 * 60 * 1000;

function item(overrides: Partial<LearningInsightItem> = {}): LearningInsightItem {
  return {
    questionId: "q1",
    status: "review",
    lastOutcome: "solved",
    nextReviewAt: FUTURE,
    subject: "Matematik",
    topic: "Denklemler",
    successfulReviews: 1,
    lastReviewedAt: PAST,
    outcomeHistory: { solvedCount: 3, struggledCount: 0, againCount: 0, knownOutcomeCount: 3 },
    ...overrides,
  };
}

const stable = (id: string, o: Partial<LearningInsightItem> = {}) => item({ questionId: id, ...o });

const persistent = (id: string, o: Partial<LearningInsightItem> = {}) =>
  item({
    questionId: id,
    lastOutcome: "struggled",
    successfulReviews: 0,
    outcomeHistory: { solvedCount: 1, struggledCount: 3, againCount: 0, knownOutcomeCount: 4 },
    ...o,
  });

const recovering = (id: string, o: Partial<LearningInsightItem> = {}) =>
  item({
    questionId: id,
    lastOutcome: "solved",
    successfulReviews: 2,
    outcomeHistory: { solvedCount: 2, struggledCount: 2, againCount: 0, knownOutcomeCount: 4 },
    ...o,
  });

const oneOff = (id: string, o: Partial<LearningInsightItem> = {}) =>
  item({
    questionId: id,
    outcomeHistory: { solvedCount: 3, struggledCount: 1, againCount: 0, knownOutcomeCount: 4 },
    ...o,
  });

/** Pre-Phase-41: counters absent, history genuinely unknown. */
const legacy = (id: string, o: Partial<LearningInsightItem> = {}) =>
  item({ questionId: id, outcomeHistory: null, ...o });

function event(over: Partial<LearningEvent> = {}): LearningEvent {
  return {
    id: "e1",
    questionId: "q1",
    outcome: "solved",
    occurredAt: PAST,
    subject: "Matematik",
    topic: "Denklemler",
    ...over,
  };
}

function build(
  items: LearningInsightItem[],
  events: LearningEvent[] = [],
  nextAction: StudentNextAction | null = null,
): LearningAtlas {
  return buildLearningAtlas({
    items,
    events,
    nextAction,
    focusCopy: nextAction ? { label: "L", title: "T", detail: "D" } : null,
    now: NOW,
  });
}

function allNodes(atlas: LearningAtlas) {
  return atlas.regions.flatMap((region) => region.nodes);
}

function nodeFor(atlas: LearningAtlas, id: string) {
  return allNodes(atlas).find((node) => node.id === id);
}

describe("empty and sparse", () => {
  it("is empty with no items", () => {
    const atlas = build([]);
    expect(atlas.isEmpty).toBe(true);
    expect(atlas.regions).toEqual([]);
    expect(atlas.totalConcepts).toBe(0);
  });

  it("renders a meaningful atlas from a single concept", () => {
    const atlas = build([stable("q1")]);
    expect(atlas.isEmpty).toBe(false);
    expect(atlas.totalConcepts).toBe(1);
    expect(atlas.regions).toHaveLength(1);
    expect(atlas.regions[0]?.nodes).toHaveLength(1);
  });

  it("skips questions with no resolvable concept rather than inventing one", () => {
    const atlas = build([stable("q1", { subject: "", topic: "" })]);
    expect(atlas.isEmpty).toBe(true);
  });

  it("skips a question missing only its topic", () => {
    expect(build([stable("q1", { topic: "" })]).totalConcepts).toBe(0);
  });

  it("skips a question missing only its subject", () => {
    expect(build([stable("q1", { subject: "" })]).totalConcepts).toBe(0);
  });
});

describe("regions", () => {
  it("groups concepts of one subject into one region", () => {
    const atlas = build([stable("q1"), stable("q2", { topic: "Problemler" })]);
    expect(atlas.regions).toHaveLength(1);
    expect(atlas.regions[0]?.nodes).toHaveLength(2);
  });

  it("separates subjects into their own regions", () => {
    const atlas = build([stable("q1"), stable("q2", { subject: "Fizik", topic: "Kuvvet" })]);
    expect(atlas.regions.map((r) => r.subject)).toEqual(["Fizik", "Matematik"]);
  });

  it("is deterministic under input permutation", () => {
    const a = [stable("q1"), persistent("q2", { topic: "Problemler" }), stable("q3", { subject: "Fizik", topic: "Kuvvet" })];
    const b = [a[2]!, a[0]!, a[1]!];
    expect(JSON.stringify(build(a).regions)).toBe(JSON.stringify(build(b).regions));
  });
});

describe("evidence honesty (carried from Phase 70, never overridden)", () => {
  it("keeps one stable question among four unknowns out of a steady state", () => {
    const atlas = build([
      stable("q1"),
      legacy("q2"),
      legacy("q3"),
      legacy("q4"),
      legacy("q5"),
    ]);
    const node = nodeFor(atlas, "Matematik|Denklemler");
    expect(node?.concept.presentation).toBe("needs_evidence");
    expect(node?.stateLabel).toBe("Daha fazla kanıt gerekiyor");
  });

  it("never averages a persistent struggle away", () => {
    const atlas = build([persistent("q1"), stable("q2"), stable("q3"), stable("q4")]);
    expect(nodeFor(atlas, "Matematik|Denklemler")?.concept.presentation).toBe("needs_attention");
  });

  it("counts unknown counters as unknown, never as zero struggles", () => {
    const node = nodeFor(build([legacy("q1"), legacy("q2")]), "Matematik|Denklemler");
    expect(node?.concept.unknownEvidenceCount).toBe(2);
    expect(node?.concept.trustworthyEvidenceCount).toBe(0);
    expect(node?.concept.presentation).not.toBe("steady");
  });

  it("keeps one-off struggle labelled as one-off, not as repetition", () => {
    const node = nodeFor(build([oneOff("q1")]), "Matematik|Denklemler");
    expect(node?.concept.presentation).toBe("watch");
    expect(node?.stateLabel).toBe("Tek zorlanma görüldü");
    expect(node?.stateLabel).not.toContain("Tekrar eden");
  });

  it("exposes no score, percentage or risk field on a node", () => {
    const node = nodeFor(build([persistent("q1")]), "Matematik|Denklemler")!;
    const keys = Object.keys(node);
    for (const banned of ["score", "percent", "risk", "mastery", "momentum", "velocity", "confidence"]) {
      expect(keys.some((k) => k.toLowerCase().includes(banned))).toBe(false);
    }
  });
});

// §93 — the model must not carry an edge type at all, because no authored
// prerequisite metadata exists anywhere in the repository to back one.
describe("no fake curriculum graph", () => {
  it("exposes no dependency field on a node", () => {
    const node = nodeFor(build([stable("q1"), stable("q2", { topic: "Problemler" })]), "Matematik|Denklemler")!;
    for (const banned of ["prerequisite", "requires", "dependson", "parent", "child", "unlocks", "edge", "next"]) {
      expect(Object.keys(node).some((k) => k.toLowerCase().includes(banned))).toBe(false);
    }
  });

  it("exposes no edge collection on the atlas itself", () => {
    const atlas = build([stable("q1"), stable("q2", { topic: "Problemler" })]);
    for (const banned of ["edges", "links", "graph", "connections", "dependencies"]) {
      expect(Object.keys(atlas).some((k) => k.toLowerCase().includes(banned))).toBe(false);
    }
  });

  it("gives adjacent nodes no relationship beyond sharing a subject", () => {
    const atlas = build([stable("q1"), stable("q2", { topic: "Problemler" })]);
    const [first, second] = atlas.regions[0]!.nodes;
    expect(first!.subject).toBe(second!.subject);
    // Nothing on either node references the other.
    expect(JSON.stringify(first)).not.toContain(second!.topic);
  });
});

describe("learning motion", () => {
  it("comes from real ordered events, oldest first", () => {
    const atlas = build(
      [persistent("q1")],
      [
        event({ id: "e2", outcome: "solved", occurredAt: PAST + 200 }),
        event({ id: "e1", outcome: "struggled", occurredAt: PAST + 100 }),
      ],
    );
    expect(nodeFor(atlas, "Matematik|Denklemler")?.motion.map((e) => e.outcome)).toEqual([
      "struggled",
      "solved",
    ]);
  });

  it("is empty when the bounded window holds nothing for that concept", () => {
    const atlas = build([stable("q1")], [event({ subject: "Fizik", topic: "Kuvvet" })]);
    expect(nodeFor(atlas, "Matematik|Denklemler")?.motion).toEqual([]);
  });

  it("never manufactures motion from cumulative counters", () => {
    // Four recorded outcomes on the counters, zero events in the window.
    const atlas = build([persistent("q1")], []);
    expect(nodeFor(atlas, "Matematik|Denklemler")?.concept.questionCount).toBe(1);
    expect(nodeFor(atlas, "Matematik|Denklemler")?.motion).toEqual([]);
  });

  it("says the window is empty once, rather than per concept", () => {
    expect(build([stable("q1")], []).hasNoRecentMotion).toBe(true);
    expect(build([stable("q1")], [event()]).hasNoRecentMotion).toBe(false);
  });

  it("keeps 'again' as its own outcome and never rewrites it as struggle", () => {
    const atlas = build([stable("q1")], [event({ outcome: "again" })]);
    expect(nodeFor(atlas, "Matematik|Denklemler")?.motion[0]?.outcome).toBe("again");
  });

  it("never lets an event with unresolved metadata contaminate a real concept", () => {
    const atlas = build([stable("q1")], [event({ subject: "", topic: "" })]);
    expect(nodeFor(atlas, "Matematik|Denklemler")?.motion).toEqual([]);
  });

  it("captions motion as a bounded window, never as a whole history", () => {
    expect(ATLAS_MOTION_CAPTION).toBe("Son öğrenme kayıtlarında");
    expect(ATLAS_MOTION_CAPTION).not.toContain("Tüm");
  });
});

describe("review readiness", () => {
  it("marks a concept due only when the scheduler has released an item", () => {
    const due = build([stable("q1", { nextReviewAt: PAST })]);
    expect(nodeFor(due, "Matematik|Denklemler")?.isDue).toBe(true);
    expect(nodeFor(build([stable("q1")]), "Matematik|Denklemler")?.isDue).toBe(false);
  });

  it("does not treat a mastered item as due even when its timestamp has passed", () => {
    const atlas = build([stable("q1", { status: "mastered", nextReviewAt: PAST })]);
    expect(nodeFor(atlas, "Matematik|Denklemler")?.isDue).toBe(false);
  });

  it("carries Phase 70's review note rather than writing a new one", () => {
    expect(nodeFor(build([stable("q1", { nextReviewAt: PAST })]), "Matematik|Denklemler")?.reviewNote).toBe(
      "Tekrar zamanı geldi.",
    );
    expect(nodeFor(build([stable("q1")]), "Matematik|Denklemler")?.reviewNote).toBeNull();
  });
});

describe("Şimdi focus", () => {
  const struggledTopic: StudentNextAction = {
    kind: "struggled_topic",
    target: { kind: "adaptive_session" },
    subject: "Matematik",
    topic: "Denklemler",
    struggledCount: 3,
  };

  it("attaches the focus to the concept the canonical action names", () => {
    const atlas = build([persistent("q1")], [], struggledTopic);
    expect(atlas.focus?.conceptId).toBe("Matematik|Denklemler");
    expect(nodeFor(atlas, "Matematik|Denklemler")?.isFocus).toBe(true);
  });

  it("refuses to attach a concept for an action that names no topic", () => {
    const dueReview: StudentNextAction = {
      kind: "due_review",
      target: { kind: "review_session" },
      dueCount: 4,
    };
    const atlas = build([persistent("q1")], [], dueReview);
    // The action itself is still shown — only the invented attachment is gone.
    expect(atlas.focus).not.toBeNull();
    expect(atlas.focus?.conceptId).toBeNull();
    expect(allNodes(atlas).every((node) => !node.isFocus)).toBe(true);
  });

  it("refuses to attach a concept for adaptive practice over legacy questions", () => {
    const adaptive: StudentNextAction = {
      kind: "adaptive_practice",
      target: { kind: "adaptive_session" },
      itemCount: 3,
    };
    expect(build([persistent("q1")], [], adaptive).focus?.conceptId).toBeNull();
  });

  it("refuses to attach a concept when there is nothing to do", () => {
    const none: StudentNextAction = {
      kind: "no_action",
      target: { kind: "none" },
      reason: "nothing_pending",
    };
    expect(build([stable("q1")], [], none).focus?.conceptId).toBeNull();
  });

  it("drops the attachment when the named concept is not on the atlas", () => {
    const elsewhere: StudentNextAction = { ...struggledTopic, topic: "Bilinmeyen" };
    const atlas = build([persistent("q1")], [], elsewhere);
    expect(atlas.focus?.conceptId).toBeNull();
    expect(allNodes(atlas).every((node) => !node.isFocus)).toBe(true);
  });

  it("has no focus at all when the action has not resolved yet", () => {
    expect(build([stable("q1")]).focus).toBeNull();
  });

  it("marks exactly one node as focus", () => {
    const atlas = build([persistent("q1"), stable("q2", { topic: "Problemler" })], [], struggledTopic);
    expect(allNodes(atlas).filter((node) => node.isFocus)).toHaveLength(1);
  });
});

describe("evidence lenses", () => {
  const items = [
    persistent("q1"),
    recovering("q2", { topic: "Problemler" }),
    stable("q3", { topic: "Geometri", nextReviewAt: PAST }),
    oneOff("q4", { topic: "Oran" }),
    legacy("q5", { topic: "Olasılık" }),
  ];

  it("shows everything under the general lens", () => {
    const atlas = build(items);
    expect(filterAtlasRegions(atlas.regions, "all").flatMap((r) => r.nodes)).toHaveLength(5);
  });

  it("shows repeated and one-off struggle under the struggle lens, each with its own label", () => {
    const atlas = build(items);
    const nodes = filterAtlasRegions(atlas.regions, "struggle").flatMap((r) => r.nodes);
    expect(nodes.map((n) => n.topic).sort()).toEqual(["Denklemler", "Oran"]);
    expect(nodes.find((n) => n.topic === "Denklemler")?.stateLabel).toBe("Tekrar eden zorlanma");
    expect(nodes.find((n) => n.topic === "Oran")?.stateLabel).toBe("Tek zorlanma görüldü");
  });

  it("shows only Phase 42 recovering under the recovery lens", () => {
    const atlas = build(items);
    const nodes = filterAtlasRegions(atlas.regions, "recovery").flatMap((r) => r.nodes);
    expect(nodes.map((n) => n.topic)).toEqual(["Problemler"]);
  });

  it("does not call a trail that merely ends on a solve a recovery", () => {
    // Real events ending on a solve, but the item's own Phase 42 verdict is
    // persistent struggle — the lens follows the verdict, not the trail.
    const atlas = build(
      [persistent("q1")],
      [
        event({ id: "e1", outcome: "struggled", occurredAt: PAST + 1 }),
        event({ id: "e2", outcome: "solved", occurredAt: PAST + 2 }),
      ],
    );
    expect(filterAtlasRegions(atlas.regions, "recovery").flatMap((r) => r.nodes)).toEqual([]);
  });

  it("shows only canonically due concepts under the review lens", () => {
    const atlas = build(items);
    const nodes = filterAtlasRegions(atlas.regions, "review").flatMap((r) => r.nodes);
    expect(nodes.map((n) => n.topic)).toEqual(["Geometri"]);
  });

  it("counts what each lens would show", () => {
    const atlas = build(items);
    expect(atlas.lensCounts).toEqual({ all: 5, struggle: 2, recovery: 1, review: 1 });
  });

  it("drops regions that no longer hold a node", () => {
    const atlas = build([...items, stable("q6", { subject: "Fizik", topic: "Kuvvet" })]);
    expect(filterAtlasRegions(atlas.regions, "review").map((r) => r.subject)).toEqual(["Matematik"]);
  });

  it("changes nothing about the nodes themselves", () => {
    const atlas = build(items);
    const before = JSON.stringify(atlas.regions);
    filterAtlasRegions(atlas.regions, "struggle");
    filterAtlasRegions(atlas.regions, "review");
    expect(JSON.stringify(atlas.regions)).toBe(before);
  });

  it("names every lens", () => {
    for (const lens of ATLAS_LENSES) {
      expect(atlasLensLabel(lens).length).toBeGreaterThan(0);
      expect(atlasEmptyLensCopy(lens).length).toBeGreaterThan(0);
    }
  });

  it("says what an empty lens actually looked for, without praise", () => {
    expect(atlasEmptyLensCopy("review")).toBe("Şu anda tekrar zamanı gelen bir konu yok.");
    for (const lens of ATLAS_LENSES) {
      const copy = atlasEmptyLensCopy(lens).toLowerCase();
      for (const overclaim of ["tebrikler", "mükemmel", "harika", "tamamladın", "ustalaştın", "%"]) {
        expect(copy).not.toContain(overclaim);
      }
    }
  });
});

describe("summary facts", () => {
  it("states counts of concepts, never a rate", () => {
    const atlas = build([persistent("q1"), stable("q2", { topic: "Geometri", nextReviewAt: PAST })]);
    const facts = atlasSummaryFacts(atlas);
    expect(facts).toEqual(["2 konu", "1 konuda tekrar eden zorlanma", "1 konuda tekrar zamanı"]);
    for (const fact of facts) expect(fact).not.toContain("%");
  });

  it("omits the parts that are not true", () => {
    expect(atlasSummaryFacts(build([stable("q1")]))).toEqual(["1 konu"]);
  });

  it("says nothing at all for an empty atlas", () => {
    expect(atlasSummaryFacts(build([]))).toEqual([]);
  });
});

// The canonical demo fixture for Student D, reproduced field-for-field from
// functions/scripts/seedDemoFixtures.mts: attemptCount 6 with the Phase 41
// counters GENUINELY ABSENT. This is the persona the whole product's honesty
// claim rests on, so the Atlas is pinned against it directly rather than
// against a generic "legacy item".
describe("Student D — legacy counters must stay unknown", () => {
  const studentD = () =>
    item({
      questionId: "demo-q-heavy",
      status: "learning",
      lastOutcome: "struggled",
      successfulReviews: 0,
      outcomeHistory: null,
      nextReviewAt: NOW + 86_400_000,
    });

  it("places the concept on the atlas rather than hiding it", () => {
    const atlas = build([studentD()]);
    expect(atlas.totalConcepts).toBe(1);
    expect(atlas.isEmpty).toBe(false);
  });

  it("never reports the concept as steady, recovering or attention-free", () => {
    const node = nodeFor(build([studentD()]), "Matematik|Denklemler")!;
    expect(node.concept.presentation).toBe("needs_evidence");
    expect(node.stateLabel).toBe("Daha fazla kanıt gerekiyor");
  });

  it("never states or implies zero struggles", () => {
    const node = nodeFor(build([studentD()]), "Matematik|Denklemler")!;
    expect(node.concept.unknownEvidenceCount).toBe(1);
    expect(node.concept.trustworthyEvidenceCount).toBe(0);
    expect(node.fact).toBe("Henüz yeterli öğrenme kanıtı yok.");
    expect(node.fact).not.toContain("0");
  });

  it("never claims mastery or completion in any visible string", () => {
    const node = nodeFor(build([studentD()]), "Matematik|Denklemler")!;
    const visible = `${node.stateLabel} ${node.fact} ${node.reviewNote ?? ""}`.toLowerCase();
    for (const overclaim of ["ustalaş", "tamamlad", "mükemmel", "%", "başarıl", "öğrendin"]) {
      expect(visible).not.toContain(overclaim);
    }
  });

  it("shows the concept under the general lens but under no evidence lens", () => {
    const atlas = build([studentD()]);
    expect(atlas.lensCounts).toEqual({ all: 1, struggle: 0, recovery: 0, review: 0 });
  });

  it("shows no fabricated motion, because the fixture writes no events for D", () => {
    expect(nodeFor(build([studentD()], []), "Matematik|Denklemler")?.motion).toEqual([]);
  });
});

describe("pattern carrying", () => {
  it("carries a Phase 71 pattern kind when one was surfaced for the topic", () => {
    const atlas = build(
      [persistent("q1"), persistent("q2")],
      [
        event({ id: "e1", questionId: "q1", outcome: "struggled", occurredAt: PAST + 1 }),
        event({ id: "e2", questionId: "q1", outcome: "struggled", occurredAt: PAST + 2 }),
      ],
    );
    expect(nodeFor(atlas, "Matematik|Denklemler")?.patternKind).not.toBeUndefined();
  });

  it("leaves the pattern null rather than inventing one", () => {
    expect(nodeFor(build([stable("q1")]), "Matematik|Denklemler")?.patternKind).toBeNull();
  });
});
