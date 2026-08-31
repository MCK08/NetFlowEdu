// Phase 61 — the explanation may only appear when chronology actually decided.
//
// The failure mode this guards is subtle and would never look like a bug: a
// question chosen purely by cumulative evidence usually ALSO has a rough
// recent run, so a naive rule would credit the timeline for decisions it had
// no part in — and every screenshot would still look correct.

import {
  chronologyExplanationText,
  resolveChronologyExplanation,
} from "../../src/features/study/services/chronologyExplanation";
import { buildChronologyProfiles } from "../../src/features/study/services/chronologyTieBreak";
import { PracticePlanItem } from "../../src/features/study/services/dailyPracticePlan";
import { LearningEvent } from "../../src/features/learningStory/services/learningTrail";
import { StudyOutcome } from "../../src/features/study/domain/studyTypes";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

function planItem(questionId: string): PracticePlanItem {
  return { questionId, reason: "struggled", subject: "Matematik", topic: "Denklemler" };
}

function ev(id: string, outcome: StudyOutcome, at: number, questionId: string): LearningEvent {
  return { id, questionId, outcome, occurredAt: at, subject: "Matematik", topic: "Denklemler" };
}

function struggling(questionId: string): LearningEvent[] {
  return [
    ev(`${questionId}-1`, "struggled", NOW - 3 * DAY, questionId),
    ev(`${questionId}-2`, "struggled", NOW - 2 * DAY, questionId),
    ev(`${questionId}-3`, "struggled", NOW - DAY, questionId),
  ];
}

describe("chronology explanation — only when it decided", () => {
  it("explains when chronology changed the leading question", () => {
    const explanation = resolveChronologyExplanation({
      planItems: [planItem("a"), planItem("b")],
      baselinePlanItems: [planItem("b"), planItem("a")],
      chronologyByQuestionId: buildChronologyProfiles(struggling("a")),
    });
    expect(explanation).toEqual({ questionId: "a", reason: "recent_repeated_struggle" });
  });

  it("stays silent when cumulative evidence picked the same question anyway", () => {
    // Identical leader in both plans — the timeline agreed, it did not decide.
    const explanation = resolveChronologyExplanation({
      planItems: [planItem("a")],
      baselinePlanItems: [planItem("a")],
      chronologyByQuestionId: buildChronologyProfiles(struggling("a")),
    });
    expect(explanation).toBeNull();
  });

  it("stays silent when the leader's sequence cannot promote it", () => {
    const steady = [
      ev("s1", "solved", NOW - 2 * DAY, "a"),
      ev("s2", "solved", NOW - DAY, "a"),
      ev("s3", "solved", NOW, "a"),
    ];
    const explanation = resolveChronologyExplanation({
      planItems: [planItem("a")],
      baselinePlanItems: [planItem("b")],
      chronologyByQuestionId: buildChronologyProfiles(steady),
    });
    expect(explanation).toBeNull();
  });

  it("stays silent when the leader has no chronology at all", () => {
    const explanation = resolveChronologyExplanation({
      planItems: [planItem("a")],
      baselinePlanItems: [planItem("b")],
      chronologyByQuestionId: buildChronologyProfiles([]),
    });
    expect(explanation).toBeNull();
  });

  it("stays silent for an empty plan", () => {
    expect(
      resolveChronologyExplanation({
        planItems: [],
        baselinePlanItems: [],
        chronologyByQuestionId: buildChronologyProfiles(struggling("a")),
      }),
    ).toBeNull();
  });
});

describe("chronology explanation — copy", () => {
  it("is observational, never causal or shaming", () => {
    const text = chronologyExplanationText({
      questionId: "a",
      reason: "recent_repeated_struggle",
    })!;
    expect(text).toContain("Son kayıtlı çalışmalarında");
    for (const bad of ["başarısız", "zayıf", "geliştirecek", "hata yapıyorsun", "sayesinde"]) {
      expect(text.toLocaleLowerCase("tr")).not.toContain(bad);
    }
  });

  it("never leaks internal terms", () => {
    for (const reason of ["recent_repeated_struggle", "recent_recovery"] as const) {
      const text = chronologyExplanationText({ questionId: "a", reason })!;
      for (const leak of [
        "recent_repeated_struggle",
        "chronology",
        "priorityWeight",
        "studyEvents",
        "adaptiveTier",
        "operationId",
      ]) {
        expect(text).not.toContain(leak);
      }
    }
  });

  it("makes no time-window or percentage claim", () => {
    for (const reason of ["recent_repeated_struggle", "recent_recovery"] as const) {
      const text = chronologyExplanationText({ questionId: "a", reason })!.toLocaleLowerCase("tr");
      for (const phrase of ["bu hafta", "geçen hafta", "son 7 gün", "%"]) {
        expect(text).not.toContain(phrase);
      }
    }
  });

  it("says nothing when there is no explanation", () => {
    expect(chronologyExplanationText(null)).toBeNull();
  });
});
