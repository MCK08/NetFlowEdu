// Phase 80 — the shared instructional vocabulary itself.
//
// The tests that matter most are the ones proving a label is NOT identity, and
// that nothing here ever merges two definitions on its own.

import {
  findDuplicateLabel,
  MAX_SEMANTIC_DESCRIPTION_LENGTH,
  MAX_SEMANTIC_LABEL_LENGTH,
  parseSemanticDefinition,
  sanitizeSemanticDefinition,
  selectableDefinitions,
  SemanticDefinition,
} from "../../src/features/questions/services/semanticDefinition";

function definition(over: Partial<SemanticDefinition> = {}): SemanticDefinition {
  return {
    id: "def-1",
    classId: "class-1",
    label: "İşaret aktarımı",
    description: null,
    subject: "Matematik",
    topic: "Denklemler",
    createdBy: "teacher-1",
    createdAt: 1,
    updatedAt: 1,
    archived: false,
    schemaVersion: 1,
    ...over,
  };
}

describe("sanitizeSemanticDefinition", () => {
  it("keeps an author's words, trimmed", () => {
    expect(
      sanitizeSemanticDefinition({
        label: "  İşaret aktarımı  ",
        subject: " Matematik ",
        topic: " Denklemler ",
      }),
    ).toEqual({
      label: "İşaret aktarımı",
      description: null,
      subject: "Matematik",
      topic: "Denklemler",
    });
  });

  it("never interprets, translates or normalises the label", () => {
    // A label is display text. Slugging it would make it look like an identity,
    // which is the one thing it must never be.
    expect(sanitizeSemanticDefinition({ label: "Sign Transfer", subject: "M", topic: "D" })?.label)
      .toBe("Sign Transfer");
  });

  it("rejects an empty label", () => {
    expect(sanitizeSemanticDefinition({ label: "   ", subject: "M", topic: "D" })).toBeNull();
  });

  it("rejects a definition with no scope", () => {
    // A definition without a subject and topic would be a claim about every
    // area of the curriculum at once.
    expect(sanitizeSemanticDefinition({ label: "x", subject: "", topic: "D" })).toBeNull();
    expect(sanitizeSemanticDefinition({ label: "x", subject: "M", topic: "  " })).toBeNull();
  });

  it("caps an overlong label and description", () => {
    const clean = sanitizeSemanticDefinition({
      label: "a".repeat(200),
      description: "b".repeat(500),
      subject: "M",
      topic: "D",
    });
    expect(clean?.label).toHaveLength(MAX_SEMANTIC_LABEL_LENGTH);
    expect(clean?.description).toHaveLength(MAX_SEMANTIC_DESCRIPTION_LENGTH);
  });

  it("treats a blank description as absent", () => {
    expect(
      sanitizeSemanticDefinition({ label: "x", description: "   ", subject: "M", topic: "D" })
        ?.description,
    ).toBeNull();
  });

  it("tolerates null input", () => {
    expect(sanitizeSemanticDefinition(null)).toBeNull();
    expect(sanitizeSemanticDefinition(undefined)).toBeNull();
  });
});

describe("parseSemanticDefinition", () => {
  it("reads a well-formed document", () => {
    expect(parseSemanticDefinition("def-1", definition())?.label).toBe("İşaret aktarımı");
  });

  it("refuses a document missing any identity-bearing field", () => {
    for (const missing of ["classId", "label", "subject", "topic", "createdBy"]) {
      const raw = { ...definition(), [missing]: "" };
      expect(parseSemanticDefinition("def-1", raw)).toBeNull();
    }
  });

  it("refuses a document with no id", () => {
    expect(parseSemanticDefinition("", definition())).toBeNull();
  });

  it("refuses a non-object", () => {
    for (const raw of [null, undefined, 42, "x", []]) {
      expect(parseSemanticDefinition("def-1", raw)).toBeNull();
    }
  });

  it("treats a missing archived flag as active", () => {
    const raw = { ...definition() } as Record<string, unknown>;
    delete raw.archived;
    expect(parseSemanticDefinition("def-1", raw)?.archived).toBe(false);
  });
});

describe("selectableDefinitions", () => {
  const all = [
    definition({ id: "a", label: "Bölme atlama" }),
    definition({ id: "b", label: "İşaret aktarımı" }),
    definition({ id: "c", label: "Arşivli", archived: true }),
    definition({ id: "d", label: "Başka konu", topic: "Geometri" }),
    definition({ id: "e", label: "Başka ders", subject: "Fizik" }),
  ];

  it("offers only active definitions in the question's own scope", () => {
    expect(selectableDefinitions(all, "Matematik", "Denklemler").map((d) => d.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("withholds archived definitions from new selection", () => {
    expect(selectableDefinitions(all, "Matematik", "Denklemler").some((d) => d.archived)).toBe(
      false,
    );
  });

  it("offers nothing without a scope to match", () => {
    expect(selectableDefinitions(all, "", "Denklemler")).toEqual([]);
    expect(selectableDefinitions(all, "Matematik", "")).toEqual([]);
  });

  it("is ordered deterministically by label", () => {
    const forward = selectableDefinitions(all, "Matematik", "Denklemler").map((d) => d.id);
    const reversed = selectableDefinitions([...all].reverse(), "Matematik", "Denklemler").map(
      (d) => d.id,
    );
    expect(forward).toEqual(reversed);
  });
});

// A duplicate label is a WARNING and nothing else. Auto-merging on similar
// wording is precisely the guess this whole phase exists to avoid.
describe("findDuplicateLabel", () => {
  const all = [definition({ id: "a", label: "İşaret aktarımı" })];

  it("finds an exact match in the same scope", () => {
    expect(findDuplicateLabel(all, "İşaret aktarımı", "Matematik", "Denklemler")?.id).toBe("a");
  });

  it("ignores case and surrounding space", () => {
    expect(findDuplicateLabel(all, "  işaret aktarimi ", "Matematik", "Denklemler")).toBeNull();
    expect(findDuplicateLabel(all, "  İŞARET AKTARIMI ", "Matematik", "Denklemler")?.id).toBe("a");
  });

  it("does not match a merely similar label", () => {
    // No fuzzy matching, no similarity score, no model. Two definitions that
    // read alike stay two definitions.
    expect(findDuplicateLabel(all, "İşaret aktarma", "Matematik", "Denklemler")).toBeNull();
  });

  it("does not match across scopes", () => {
    expect(findDuplicateLabel(all, "İşaret aktarımı", "Matematik", "Geometri")).toBeNull();
    expect(findDuplicateLabel(all, "İşaret aktarımı", "Fizik", "Denklemler")).toBeNull();
  });

  it("does not match an archived definition", () => {
    const archived = [definition({ id: "a", archived: true })];
    expect(findDuplicateLabel(archived, "İşaret aktarımı", "Matematik", "Denklemler")).toBeNull();
  });

  it("returns null for an empty label", () => {
    expect(findDuplicateLabel(all, "   ", "Matematik", "Denklemler")).toBeNull();
  });
});
