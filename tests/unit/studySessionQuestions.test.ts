import { toAdaptiveSessionQuestions } from "../../src/features/study/services/studySessionQuestions";
import { PracticePlanItem } from "../../src/features/study/services/dailyPracticePlan";
import { Question } from "@/types/question";

function planItem(overrides: Partial<PracticePlanItem> = {}): PracticePlanItem {
  return {
    questionId: "q1",
    reason: "due",
    subject: "Matematik",
    topic: "Kesirler",
    ...overrides,
  };
}

function question(id: string, overrides: Partial<Question> = {}): Question {
  return {
    id,
    ownerId: "teacher-1",
    organizationId: "org-1",
    visibility: "class",
    imageUrl: `https://example.com/${id}.jpg`,
    classId: "class-1",
    subject: "Matematik",
    topic: "Kesirler",
    gradeLevel: "7",
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

describe("toAdaptiveSessionQuestions — §D/§E/§F/§G ordering carried through unchanged", () => {
  it("preserves buildAdaptivePracticePlan's own planItems order exactly", () => {
    const planItems = [
      planItem({ questionId: "due1", reason: "due" }),
      planItem({ questionId: "struggled1", reason: "struggled" }),
      planItem({ questionId: "weak1", reason: "weak_topic" }),
      planItem({ questionId: "fill1", reason: "goal_fill" }),
    ];
    const questionsById = new Map([
      ["due1", question("due1")],
      ["struggled1", question("struggled1")],
      ["weak1", question("weak1")],
      ["fill1", question("fill1")],
    ]);
    const result = toAdaptiveSessionQuestions(planItems, questionsById);
    expect(result.map((q) => q.id)).toEqual(["due1", "struggled1", "weak1", "fill1"]);
  });
});

describe("toAdaptiveSessionQuestions — §C duplicate protection", () => {
  it("never produces the same question twice even if planItems somehow repeats an id", () => {
    const planItems = [planItem({ questionId: "q1" }), planItem({ questionId: "q1" })];
    const questionsById = new Map([["q1", question("q1")]]);
    const result = toAdaptiveSessionQuestions(planItems, questionsById);
    expect(result).toHaveLength(1);
  });
});

describe("toAdaptiveSessionQuestions — §L insufficient/missing data", () => {
  it("skips a plan item whose question metadata never resolved (deleted/access revoked)", () => {
    const planItems = [planItem({ questionId: "gone" }), planItem({ questionId: "q1" })];
    const questionsById = new Map<string, Question | null>([
      ["gone", null],
      ["q1", question("q1")],
    ]);
    const result = toAdaptiveSessionQuestions(planItems, questionsById);
    expect(result.map((q) => q.id)).toEqual(["q1"]);
  });

  it("returns an empty array for an empty plan — never throws", () => {
    expect(toAdaptiveSessionQuestions([], new Map())).toEqual([]);
  });

  it("does not crash when a questionId has no map entry at all", () => {
    const planItems = [planItem({ questionId: "unmapped" })];
    expect(() => toAdaptiveSessionQuestions(planItems, new Map())).not.toThrow();
    expect(toAdaptiveSessionQuestions(planItems, new Map())).toEqual([]);
  });
});

describe("toAdaptiveSessionQuestions — robustness", () => {
  it("is deterministic for the same input", () => {
    const planItems = [planItem({ questionId: "a" }), planItem({ questionId: "b" })];
    const questionsById = new Map([
      ["a", question("a")],
      ["b", question("b")],
    ]);
    const first = toAdaptiveSessionQuestions(planItems, questionsById);
    const second = toAdaptiveSessionQuestions(planItems, questionsById);
    expect(first).toEqual(second);
  });

  it("does not mutate its inputs", () => {
    const planItems = [planItem({ questionId: "a" })];
    const questionsById = new Map([["a", question("a")]]);
    const planItemsCopy = planItems.map((p) => ({ ...p }));
    const mapCopy = new Map(questionsById);
    toAdaptiveSessionQuestions(planItems, questionsById);
    expect(planItems).toEqual(planItemsCopy);
    expect(questionsById).toEqual(mapCopy);
  });
});
