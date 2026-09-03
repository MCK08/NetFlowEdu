// Phase 73 — the teacher action center.
//
// Phase 47's semantics are the contract: a low-confidence verdict never becomes
// an escalation, an improved outcome never becomes a follow-up, and "monitor"
// is never presented as something to do today.

import {
  actionCenterLabel,
  ACTION_CENTER_EMPTY_COPY,
  buildTeacherActionCenter,
  MAX_ACTION_CENTER_ITEMS,
  StudentInterventionOutcome,
} from "../../src/features/teacher/services/teacherActionCenter";
import {
  InterventionConfidence,
  InterventionEffectiveness,
  InterventionEffectivenessResult,
} from "../../src/features/teacher/services/interventionEffectiveness";
import { resolvePostInterventionAction } from "../../src/features/teacher/services/postInterventionAction";
import { TeacherAction } from "../../src/features/teacher/services/teacherActionSummary";

function result(
  effectiveness: InterventionEffectiveness,
  confidence: InterventionConfidence,
  reviewedSinceCount = 3,
): InterventionEffectivenessResult {
  return {
    interventionId: "a1",
    previousState: "persistent_struggle",
    currentState: effectiveness === "improved" ? "stable" : "persistent_struggle",
    effectiveness,
    confidence,
    explanation: "",
    reviewedSinceCount,
  };
}

/** Built through the REAL Phase 47 resolver, never a hand-written kind. */
function outcome(
  studentUid: string,
  displayName: string,
  effectiveness: InterventionEffectiveness,
  confidence: InterventionConfidence,
  reviewedSinceCount = 3,
): StudentInterventionOutcome {
  const r = result(effectiveness, confidence, reviewedSinceCount);
  return {
    studentUid,
    displayName,
    action: resolvePostInterventionAction(effectiveness, confidence),
    result: r,
  };
}

function topicAction(topic: string): TeacherAction {
  return {
    kind: "create_question",
    title: topic,
    reason: `${topic} konusunda sınıfta zorlanma var.`,
    topicContext: { subject: "Matematik", topic, gradeLevel: "9" },
    studentUid: null,
  };
}

function studentAction(uid: string, name: string): TeacherAction {
  return {
    kind: "open_student",
    title: name,
    reason: `${name} için dikkat gerekiyor.`,
    topicContext: null,
    studentUid: uid,
  };
}

function build(
  outcomes: StudentInterventionOutcome[] = [],
  summaryActions: TeacherAction[] = [],
) {
  return buildTeacherActionCenter({ outcomes, summaryActions });
}

describe("action center — empty", () => {
  it("has nothing to show with no evidence", () => {
    expect(build()).toHaveLength(0);
  });

  it("does not claim the class is fine", () => {
    // Students with no trustworthy evidence are invisible to every signal
    // behind this list, so "everyone is doing well" would be unsupported.
    expect(ACTION_CENTER_EMPTY_COPY).toBe("Şu anda öne çıkan bir öğretmen aksiyonu yok.");
    expect(ACTION_CENTER_EMPTY_COPY).not.toMatch(/iyi|başarılı|sorun yok/i);
  });
});

describe("action center — Phase 47 integrity", () => {
  it("surfaces a regression with real confidence as a priority review", () => {
    const items = build([outcome("s1", "Ayşe", "worsened", "high")]);
    expect(items).toHaveLength(1);
    expect(items[0]!.kind).toBe("escalate");
    expect(actionCenterLabel(items[0]!)).toBe("Öncelikli inceleme");
  });

  // §79 — mandatory.
  it("never escalates on low-confidence evidence", () => {
    const items = build([outcome("s1", "Ayşe", "worsened", "low")]);
    expect(items).toHaveLength(0);
  });

  it("surfaces an unchanged outcome with real confidence as a follow-up", () => {
    const items = build([outcome("s1", "Ayşe", "no_change", "medium")]);
    expect(items[0]!.kind).toBe("follow_up");
    expect(actionCenterLabel(items[0]!)).toBe("Takip gerekli");
  });

  it("never turns an improved outcome into an action", () => {
    expect(build([outcome("s1", "Ayşe", "improved", "high")])).toHaveLength(0);
  });

  it("never presents monitor as something to do today", () => {
    // Monitor's own copy says no action is recommended; listing it here would
    // contradict the verdict it carries.
    const items = build([
      outcome("s1", "Ayşe", "improved", "high"),
      outcome("s2", "Berk", "no_change", "low"),
    ]);
    expect(items).toHaveLength(0);
  });

  it("carries Phase 47's own reason text unchanged", () => {
    const items = build([outcome("s1", "Ayşe", "worsened", "high")]);
    expect(items[0]!.reason).toBe(
      resolvePostInterventionAction("worsened", "high").reason,
    );
  });

  it("makes no causal claim about the intervention", () => {
    const items = build([
      outcome("s1", "Ayşe", "worsened", "high"),
      outcome("s2", "Berk", "no_change", "high"),
    ]);
    const copy = items.map((i) => `${i.reason} ${i.evidenceNote ?? ""}`).join(" ").toLocaleLowerCase("tr");
    for (const claim of ["geliştirdi", "sayesinde", "neden oldu", "başarısız oldu", "işe yaradı"]) {
      expect(copy).not.toContain(claim);
    }
  });
});

describe("action center — evidence note", () => {
  it("states how much was reviewed after the intervention", () => {
    const items = build([outcome("s1", "Ayşe", "worsened", "high", 4)]);
    expect(items[0]!.evidenceNote).toBe("Müdahaleden sonra 4 soru tekrar edildi.");
  });

  it("uses singular wording for one", () => {
    const items = build([outcome("s1", "Ayşe", "worsened", "high", 1)]);
    expect(items[0]!.evidenceNote).toBe("Müdahaleden sonra 1 soru tekrar edildi.");
  });

  it("omits the note when nothing was reviewed", () => {
    const items = build([outcome("s1", "Ayşe", "worsened", "high", 0)]);
    expect(items[0]!.evidenceNote).toBeNull();
  });
});

describe("action center — ordering", () => {
  it("puts escalation above follow-up above hotspot above student", () => {
    const items = build(
      [outcome("s1", "Ayşe", "no_change", "high"), outcome("s2", "Berk", "worsened", "high")],
      [topicAction("Denklemler"), studentAction("s3", "Ceren")],
    );
    expect(items.map((i) => i.kind)).toEqual([
      "escalate",
      "follow_up",
      "prepare_intervention",
      "review_student",
    ]);
  });

  it("preserves the source order inside one kind", () => {
    const items = build([
      outcome("s1", "Ayşe", "worsened", "high"),
      outcome("s2", "Berk", "worsened", "high"),
    ]);
    expect(items.map((i) => i.studentUid)).toEqual(["s1", "s2"]);
  });

  it("preserves the summary's own hotspot order", () => {
    const items = build([], [topicAction("Denklemler"), topicAction("Geometri")]);
    expect(items.map((i) => i.title)).toEqual(["Denklemler", "Geometri"]);
  });

  it("is identical for the same inputs", () => {
    const outcomes = [outcome("s1", "Ayşe", "worsened", "high"), outcome("s2", "Berk", "no_change", "high")];
    const summary = [topicAction("Denklemler")];
    expect(build(outcomes, summary).map((i) => i.id)).toEqual(
      build(outcomes, summary).map((i) => i.id),
    );
  });
});

describe("action center — deduplication", () => {
  it("shows one action per student", () => {
    const items = build([
      outcome("s1", "Ayşe", "worsened", "high"),
      outcome("s1", "Ayşe", "no_change", "high"),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]!.kind).toBe("escalate");
  });

  it("does not repeat a student who already has an intervention action", () => {
    const items = build(
      [outcome("s1", "Ayşe", "worsened", "high")],
      [studentAction("s1", "Ayşe")],
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.kind).toBe("escalate");
  });

  it("keeps a different student from the summary", () => {
    const items = build(
      [outcome("s1", "Ayşe", "worsened", "high")],
      [studentAction("s2", "Berk")],
    );
    expect(items.map((i) => i.studentUid)).toEqual(["s1", "s2"]);
  });
});

describe("action center — bounded", () => {
  it("caps how many actions a teacher is shown at once", () => {
    const outcomes = Array.from({ length: 4 }, (_, i) =>
      outcome(`s${i}`, `S${i}`, "worsened", "high"),
    );
    const summary = Array.from({ length: 6 }, (_, i) => topicAction(`T${i}`));
    expect(build(outcomes, summary).length).toBeLessThanOrEqual(MAX_ACTION_CENTER_ITEMS);
    expect(MAX_ACTION_CENTER_ITEMS).toBe(5);
  });

  it("keeps the strongest actions when it has to cut", () => {
    const outcomes = Array.from({ length: 6 }, (_, i) =>
      outcome(`s${i}`, `S${i}`, "worsened", "high"),
    );
    const items = build(outcomes, [topicAction("Denklemler")]);
    expect(items.every((i) => i.kind === "escalate")).toBe(true);
  });
});

describe("action center — copy safety", () => {
  it("exposes no raw enum to the teacher", () => {
    const items = build(
      [outcome("s1", "Ayşe", "worsened", "high"), outcome("s2", "Berk", "no_change", "high")],
      [topicAction("Denklemler"), studentAction("s3", "Ceren")],
    );
    const copy = items
      .map((i) => `${actionCenterLabel(i)} ${i.title} ${i.reason} ${i.evidenceNote ?? ""}`)
      .join(" ");
    for (const leak of ["escalate", "follow_up", "monitor", "review_student", "prepare_intervention", "no_change", "worsened"]) {
      expect(copy).not.toContain(leak);
    }
  });

  it("states no score or urgency percentage", () => {
    const items = build([outcome("s1", "Ayşe", "worsened", "high")], [topicAction("Denklemler")]);
    const copy = items.map((i) => `${i.reason} ${i.evidenceNote ?? ""}`).join(" ");
    expect(copy).not.toMatch(/%/);
    expect(copy).not.toMatch(/puan|skor|öncelik puanı|risk/i);
  });

  it("labels each action in teacher language", () => {
    expect(actionCenterLabel(build([outcome("s1", "A", "worsened", "high")])[0]!)).toBe("Öncelikli inceleme");
    expect(actionCenterLabel(build([outcome("s1", "A", "no_change", "high")])[0]!)).toBe("Takip gerekli");
    expect(actionCenterLabel(build([], [topicAction("D")])[0]!)).toBe("Müdahale öneriliyor");
    expect(actionCenterLabel(build([], [studentAction("s1", "A")])[0]!)).toBe("İzle");
  });
});
