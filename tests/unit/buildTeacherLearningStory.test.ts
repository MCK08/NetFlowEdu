// Phase 56 — the class story's honesty rules.
//
// The teacher side's specific risk is causal language: this screen sits next
// to intervention data, and "the intervention worked" is exactly the claim
// Phase 44 was careful never to make. These tests hold that line.

import { buildTeacherLearningStory } from "../../src/features/learningStory/services/buildTeacherLearningStory";
import { StudentAttentionCard } from "../../src/features/teacher/services/studentAttention";

type Category = StudentAttentionCard["insight"]["category"];

function card(uid: string, category: Category): StudentAttentionCard {
  return {
    studentUid: uid,
    displayName: `Öğrenci ${uid}`,
    insight: { category, reasons: ["Test gerekçesi"], implicatedTopic: null },
    successRatePercent: null,
  };
}

function allCopy(story: ReturnType<typeof buildTeacherLearningStory>): string {
  return [
    story.headline,
    story.subheadline ?? "",
    ...story.sections.flatMap((s) => [s.title, s.description]),
  ].join(" | ");
}

describe("buildTeacherLearningStory — sections", () => {
  it("counts students per section and names them for routing", () => {
    const story = buildTeacherLearningStory([
      card("a", "needs_attention"),
      card("b", "needs_attention"),
      card("c", "progressing"),
    ]);
    const struggle = story.sections.find((s) => s.id === "persistent_struggle");
    expect(struggle?.studentCount).toBe(2);
    expect(struggle?.studentUids).toEqual(["a", "b"]);
    expect(struggle?.description).toContain("2 öğrencide");
  });

  it("omits sections entirely rather than showing a zero", () => {
    const story = buildTeacherLearningStory([card("a", "needs_attention")]);
    expect(story.sections.map((s) => s.id)).toEqual(["persistent_struggle"]);
    expect(allCopy(story)).not.toMatch(/\b0 öğrenci/);
  });

  it("leads with recovery when there is any", () => {
    const story = buildTeacherLearningStory([
      card("a", "needs_attention"),
      card("b", "progressing"),
    ]);
    expect(story.sections[0]!.id).toBe("recovering");
  });

  it("does not repeat a section's sentence as the subheadline", () => {
    const story = buildTeacherLearningStory([
      card("a", "needs_attention"),
      card("b", "needs_attention"),
      card("c", "needs_attention"),
    ]);
    const descriptions = story.sections.map((s) => s.description);
    expect(descriptions).not.toContain(story.subheadline);
    // It says how many students the summary actually covers.
    expect(story.subheadline).toContain("3 öğrencinin");
  });

  it("returns the first-run story when nothing is known yet", () => {
    const story = buildTeacherLearningStory([card("a", "insufficient_data")]);
    expect(story.isFirstRun).toBe(true);
    expect(story.sections).toHaveLength(0);
    expect(story.headline).toContain("Öğrenciler çalıştıkça");
  });

  it("returns the first-run story for an empty class", () => {
    expect(buildTeacherLearningStory([]).isFirstRun).toBe(true);
  });

  it("is deterministic regardless of card order", () => {
    const cards = [card("c", "needs_attention"), card("a", "progressing"), card("b", "watch")];
    const forward = buildTeacherLearningStory(cards).sections.map((s) => s.id);
    const reversed = buildTeacherLearningStory([...cards].reverse()).sections.map((s) => s.id);
    expect(reversed).toEqual(forward);
  });

  it("sorts student uids stably inside a section", () => {
    const story = buildTeacherLearningStory([
      card("z", "needs_attention"),
      card("a", "needs_attention"),
      card("m", "needs_attention"),
    ]);
    expect(story.sections[0]!.studentUids).toEqual(["a", "m", "z"]);
  });
});

describe("buildTeacherLearningStory — honesty", () => {
  const every: Category[] = [
    "needs_attention",
    "watch",
    "progressing",
    "strong",
    "insufficient_data",
  ];

  it("never makes a causal claim about an intervention", () => {
    const story = buildTeacherLearningStory(every.map((c, i) => card(String(i), c)));
    const copy = allCopy(story).toLocaleLowerCase("tr");
    for (const claim of ["işe yaradı", "sayesinde", "neden oldu", "müdahale çalıştı", "başardınız"]) {
      expect(copy).not.toContain(claim);
    }
  });

  it("never uses time-window language", () => {
    const story = buildTeacherLearningStory(every.map((c, i) => card(String(i), c)));
    const copy = allCopy(story).toLocaleLowerCase("tr");
    for (const phrase of ["bu hafta", "geçen hafta", "son 7 gün", "%"]) {
      expect(copy).not.toContain(phrase);
    }
  });

  it("never leaks internal category names", () => {
    const story = buildTeacherLearningStory(every.map((c, i) => card(String(i), c)));
    const copy = allCopy(story);
    for (const leak of [
      "needs_attention",
      "insufficient_data",
      "persistent_struggle",
      "progressing",
      "successRatePercent",
    ]) {
      expect(copy).not.toContain(leak);
    }
  });

  it("uses observational wording for every emitted section", () => {
    const story = buildTeacherLearningStory(every.map((c, i) => card(String(i), c)));
    expect(story.sections.length).toBeGreaterThan(0);
    for (const section of story.sections) {
      // Each description reports what is visible, never why it happened.
      expect(section.description).toMatch(/görülüyor|durumda|bekliyor/);
    }
  });
});
