import {
  EMPTY_GUIDED_TOUR_RECORD,
  GUIDED_TOUR_STEPS,
  GUIDED_TOUR_STORAGE_KEY,
  GUIDED_TOUR_VERSION,
  GuidedTourAudience,
  GuidedTourGateInput,
  GuidedTourRecord,
  MAX_REMEMBERED_COMPLETIONS,
  guidedTourActionLabel,
  isGuidedTourComplete,
  isLastGuidedTourStep,
  nextGuidedTourStep,
  parseGuidedTourRecord,
  resolveGuidedTourAudience,
  resolveGuidedTourPresentation,
  serializeGuidedTourRecord,
  withGuidedTourCompleted,
  withGuidedTourReset,
} from "@features/onboarding/services/guidedTour";

const STUDENT = "student" as const;
const TEACHER = "teacher" as const;

function record(
  entries: readonly { userId: string; audience: GuidedTourAudience }[],
): GuidedTourRecord {
  return { version: GUIDED_TOUR_VERSION, completions: entries };
}

// A fully-eligible, brand-new student. Each test below overrides exactly the
// one field it is about, so a failure names its own cause.
function freshStudent(overrides: Partial<GuidedTourGateInput> = {}): GuidedTourGateInput {
  return {
    recordLoaded: true,
    record: EMPTY_GUIDED_TOUR_RECORD,
    isAuthenticated: true,
    isEmailVerified: true,
    accountOnboardingStatus: "complete",
    role: "student",
    userId: "u1",
    ...overrides,
  };
}

describe("guided tour storage key", () => {
  it("is namespaced and versioned like the app's other local preferences", () => {
    expect(GUIDED_TOUR_STORAGE_KEY).toBe("netflowedu.onboarding.tour.v1");
  });
});

describe("authored steps", () => {
  it("keeps both tours short enough to finish", () => {
    expect(GUIDED_TOUR_STEPS.student.length).toBe(3);
    expect(GUIDED_TOUR_STEPS.teacher.length).toBe(3);
  });

  it("gives students and teachers different copy", () => {
    const studentTitles = GUIDED_TOUR_STEPS.student.map((step) => step.title);
    const teacherTitles = GUIDED_TOUR_STEPS.teacher.map((step) => step.title);
    expect(studentTitles).not.toEqual(teacherTitles);
    for (const title of studentTitles) {
      expect(teacherTitles).not.toContain(title);
    }
  });

  it("never claims the product understands the learner or guarantees a result", () => {
    const forbidden = [
      "garanti",
      "yapay zekâ",
      "yapay zeka",
      "anlar",
      "bilir",
      "tahmin eder",
      "%",
    ];
    for (const audience of [STUDENT, TEACHER]) {
      for (const step of GUIDED_TOUR_STEPS[audience]) {
        const text = `${step.title} ${step.body}`.toLowerCase();
        for (const claim of forbidden) {
          expect(text).not.toContain(claim);
        }
      }
    }
  });

  it("authors every step with real copy in both fields", () => {
    for (const audience of [STUDENT, TEACHER]) {
      for (const step of GUIDED_TOUR_STEPS[audience]) {
        expect(step.title.trim().length).toBeGreaterThan(0);
        expect(step.body.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe("parseGuidedTourRecord", () => {
  it("treats absent storage as nothing completed", () => {
    expect(parseGuidedTourRecord(null)).toEqual(EMPTY_GUIDED_TOUR_RECORD);
  });

  it("treats an empty string as nothing completed", () => {
    expect(parseGuidedTourRecord("")).toEqual(EMPTY_GUIDED_TOUR_RECORD);
  });

  it("survives malformed JSON without throwing", () => {
    expect(() => parseGuidedTourRecord("{not json")).not.toThrow();
    expect(parseGuidedTourRecord("{not json")).toEqual(EMPTY_GUIDED_TOUR_RECORD);
  });

  it("rejects a JSON value that is not an object", () => {
    expect(parseGuidedTourRecord("42")).toEqual(EMPTY_GUIDED_TOUR_RECORD);
    expect(parseGuidedTourRecord('"done"')).toEqual(EMPTY_GUIDED_TOUR_RECORD);
    expect(parseGuidedTourRecord("null")).toEqual(EMPTY_GUIDED_TOUR_RECORD);
    expect(parseGuidedTourRecord("[]")).toEqual(EMPTY_GUIDED_TOUR_RECORD);
  });

  it("ignores a record written by an unknown version", () => {
    const raw = JSON.stringify({ version: 99, completions: [{ userId: "u1", audience: STUDENT }] });
    expect(parseGuidedTourRecord(raw)).toEqual(EMPTY_GUIDED_TOUR_RECORD);
  });

  it("ignores a record with no version", () => {
    const raw = JSON.stringify({ completions: [{ userId: "u1", audience: STUDENT }] });
    expect(parseGuidedTourRecord(raw)).toEqual(EMPTY_GUIDED_TOUR_RECORD);
  });

  it("ignores a completions field that is not an array", () => {
    const raw = JSON.stringify({ version: GUIDED_TOUR_VERSION, completions: { u1: true } });
    expect(parseGuidedTourRecord(raw)).toEqual(EMPTY_GUIDED_TOUR_RECORD);
  });

  it("drops individual malformed entries but keeps the valid ones", () => {
    const raw = JSON.stringify({
      version: GUIDED_TOUR_VERSION,
      completions: [
        { userId: "u1", audience: STUDENT },
        null,
        "nope",
        { userId: "", audience: STUDENT },
        { userId: "u2" },
        { userId: "u3", audience: "organization_admin" },
        { audience: TEACHER },
        { userId: "u4", audience: TEACHER },
      ],
    });
    expect(parseGuidedTourRecord(raw).completions).toEqual([
      { userId: "u1", audience: STUDENT },
      { userId: "u4", audience: TEACHER },
    ]);
  });

  it("caps an oversized stored list on read", () => {
    const raw = JSON.stringify({
      version: GUIDED_TOUR_VERSION,
      completions: Array.from({ length: MAX_REMEMBERED_COMPLETIONS + 5 }, (_, i) => ({
        userId: `u${i}`,
        audience: STUDENT,
      })),
    });
    expect(parseGuidedTourRecord(raw).completions).toHaveLength(MAX_REMEMBERED_COMPLETIONS);
  });

  it("round-trips through serialize", () => {
    const source = record([
      { userId: "u1", audience: STUDENT },
      { userId: "u2", audience: TEACHER },
    ]);
    expect(parseGuidedTourRecord(serializeGuidedTourRecord(source))).toEqual(source);
  });
});

describe("isGuidedTourComplete", () => {
  it("is false on an empty record", () => {
    expect(isGuidedTourComplete(EMPTY_GUIDED_TOUR_RECORD, "u1", STUDENT)).toBe(false);
  });

  it("is true only for the exact account and audience", () => {
    const stored = record([{ userId: "u1", audience: STUDENT }]);
    expect(isGuidedTourComplete(stored, "u1", STUDENT)).toBe(true);
    // Same device, same person, other role — a different product.
    expect(isGuidedTourComplete(stored, "u1", TEACHER)).toBe(false);
    // Same role, different account on a shared device.
    expect(isGuidedTourComplete(stored, "u2", STUDENT)).toBe(false);
  });
});

describe("withGuidedTourCompleted", () => {
  it("records the completion most-recent-first", () => {
    const next = withGuidedTourCompleted(EMPTY_GUIDED_TOUR_RECORD, "u1", STUDENT);
    expect(next.completions).toEqual([{ userId: "u1", audience: STUDENT }]);
  });

  it("does not disturb another account's completion", () => {
    const stored = record([{ userId: "u2", audience: TEACHER }]);
    const next = withGuidedTourCompleted(stored, "u1", STUDENT);
    expect(isGuidedTourComplete(next, "u2", TEACHER)).toBe(true);
    expect(isGuidedTourComplete(next, "u1", STUDENT)).toBe(true);
  });

  it("deduplicates a repeat instead of appending", () => {
    const once = withGuidedTourCompleted(EMPTY_GUIDED_TOUR_RECORD, "u1", STUDENT);
    const twice = withGuidedTourCompleted(once, "u1", STUDENT);
    expect(twice.completions).toHaveLength(1);
  });

  it("bounds the remembered list and evicts the oldest", () => {
    let current = EMPTY_GUIDED_TOUR_RECORD;
    for (let i = 0; i < MAX_REMEMBERED_COMPLETIONS + 3; i++) {
      current = withGuidedTourCompleted(current, `u${i}`, STUDENT);
    }
    expect(current.completions).toHaveLength(MAX_REMEMBERED_COMPLETIONS);
    // The most recent survives, the first one does not.
    expect(isGuidedTourComplete(current, `u${MAX_REMEMBERED_COMPLETIONS + 2}`, STUDENT)).toBe(true);
    expect(isGuidedTourComplete(current, "u0", STUDENT)).toBe(false);
  });

  it("counts the two audiences of one account separately", () => {
    let current = withGuidedTourCompleted(EMPTY_GUIDED_TOUR_RECORD, "u1", STUDENT);
    current = withGuidedTourCompleted(current, "u1", TEACHER);
    expect(current.completions).toHaveLength(2);
  });
});

describe("withGuidedTourReset", () => {
  it("removes only the named pair", () => {
    const stored = record([
      { userId: "u1", audience: STUDENT },
      { userId: "u1", audience: TEACHER },
      { userId: "u2", audience: STUDENT },
    ]);
    const next = withGuidedTourReset(stored, "u1", STUDENT);
    expect(isGuidedTourComplete(next, "u1", STUDENT)).toBe(false);
    expect(isGuidedTourComplete(next, "u1", TEACHER)).toBe(true);
    expect(isGuidedTourComplete(next, "u2", STUDENT)).toBe(true);
  });

  it("is a no-op when nothing was recorded", () => {
    expect(withGuidedTourReset(EMPTY_GUIDED_TOUR_RECORD, "u1", STUDENT).completions).toEqual([]);
  });
});

describe("resolveGuidedTourAudience", () => {
  it("maps the two learner-facing roles", () => {
    expect(resolveGuidedTourAudience("student")).toBe(STUDENT);
    expect(resolveGuidedTourAudience("teacher")).toBe(TEACHER);
  });

  it("has no tour for admin roles or an unknown role", () => {
    expect(resolveGuidedTourAudience("organization_admin")).toBeNull();
    expect(resolveGuidedTourAudience("platform_admin")).toBeNull();
    expect(resolveGuidedTourAudience(null)).toBeNull();
  });
});

describe("resolveGuidedTourPresentation", () => {
  it("shows a fresh student their own tour", () => {
    const result = resolveGuidedTourPresentation(freshStudent());
    expect(result).toEqual({
      kind: "visible",
      audience: STUDENT,
      steps: GUIDED_TOUR_STEPS.student,
    });
  });

  it("shows a fresh teacher the teacher tour", () => {
    const result = resolveGuidedTourPresentation(freshStudent({ role: "teacher" }));
    expect(result.kind).toBe("visible");
    expect(result.kind === "visible" && result.steps).toEqual(GUIDED_TOUR_STEPS.teacher);
  });

  it("shows nothing until the stored record has actually been read", () => {
    expect(
      resolveGuidedTourPresentation(freshStudent({ recordLoaded: false, record: null })),
    ).toEqual({ kind: "hidden" });
  });

  it("shows nothing when the record is missing even if the flag says loaded", () => {
    expect(resolveGuidedTourPresentation(freshStudent({ record: null }))).toEqual({
      kind: "hidden",
    });
  });

  it("hides the tour from a student who already completed it", () => {
    const input = freshStudent({ record: record([{ userId: "u1", audience: STUDENT }]) });
    expect(resolveGuidedTourPresentation(input)).toEqual({ kind: "hidden" });
  });

  it("hides the tour from a teacher who already completed it", () => {
    const input = freshStudent({
      role: "teacher",
      record: record([{ userId: "u1", audience: TEACHER }]),
    });
    expect(resolveGuidedTourPresentation(input)).toEqual({ kind: "hidden" });
  });

  it("still shows the teacher tour to someone who only finished the student one", () => {
    const input = freshStudent({
      role: "teacher",
      record: record([{ userId: "u1", audience: STUDENT }]),
    });
    expect(resolveGuidedTourPresentation(input).kind).toBe("visible");
  });

  it("still shows the tour to a different account on the same device", () => {
    const input = freshStudent({
      userId: "u2",
      record: record([{ userId: "u1", audience: STUDENT }]),
    });
    expect(resolveGuidedTourPresentation(input).kind).toBe("visible");
  });

  it("shows nothing when signed out", () => {
    expect(resolveGuidedTourPresentation(freshStudent({ isAuthenticated: false }))).toEqual({
      kind: "hidden",
    });
  });

  it("shows nothing before the email is verified", () => {
    expect(resolveGuidedTourPresentation(freshStudent({ isEmailVerified: false }))).toEqual({
      kind: "hidden",
    });
  });

  it("waits for the server to finish provisioning the account", () => {
    for (const status of ["pending", "provisioning", null] as const) {
      expect(
        resolveGuidedTourPresentation(freshStudent({ accountOnboardingStatus: status })),
      ).toEqual({ kind: "hidden" });
    }
  });

  it("shows nothing for a role with no authored tour", () => {
    for (const role of ["organization_admin", "platform_admin", null] as const) {
      expect(resolveGuidedTourPresentation(freshStudent({ role }))).toEqual({ kind: "hidden" });
    }
  });

  it("shows nothing without a user id to scope the completion to", () => {
    expect(resolveGuidedTourPresentation(freshStudent({ userId: null }))).toEqual({
      kind: "hidden",
    });
    expect(resolveGuidedTourPresentation(freshStudent({ userId: "" }))).toEqual({
      kind: "hidden",
    });
  });

  // The property that replaces a routing-loop test: the tour is a gate, not a
  // redirect, so "no loop" means completing it must make it stay closed with
  // no further input. Modelled in the hook's exact order — resolve, commit
  // through withGuidedTourCompleted, resolve again.
  it("closes for good once completed, and stays closed on the next launch", () => {
    const input = freshStudent();
    const first = resolveGuidedTourPresentation(input);
    expect(first.kind).toBe("visible");

    const committed = withGuidedTourCompleted(input.record!, input.userId!, STUDENT);
    const afterCommit = resolveGuidedTourPresentation({ ...input, record: committed });
    expect(afterCommit).toEqual({ kind: "hidden" });

    // Next launch: the same bytes come back off the device.
    const rehydrated = parseGuidedTourRecord(serializeGuidedTourRecord(committed));
    expect(resolveGuidedTourPresentation({ ...input, record: rehydrated })).toEqual({
      kind: "hidden",
    });
  });

  it("reopens exactly once after a replay, then closes again", () => {
    const completed = record([{ userId: "u1", audience: STUDENT }]);
    const input = freshStudent({ record: completed });
    expect(resolveGuidedTourPresentation(input)).toEqual({ kind: "hidden" });

    const afterReplay = withGuidedTourReset(completed, "u1", STUDENT);
    expect(resolveGuidedTourPresentation({ ...input, record: afterReplay }).kind).toBe("visible");

    const afterFinish = withGuidedTourCompleted(afterReplay, "u1", STUDENT);
    expect(resolveGuidedTourPresentation({ ...input, record: afterFinish })).toEqual({
      kind: "hidden",
    });
  });

  // Account switch: one run of the app, two accounts. Skipping on the first
  // must not silently consume the second account's introduction.
  it("does not carry one account's dismissal over to the next account switched to", () => {
    const first = freshStudent();
    const dismissed = withGuidedTourCompleted(first.record!, "u1", STUDENT);
    expect(resolveGuidedTourPresentation({ ...first, record: dismissed })).toEqual({
      kind: "hidden",
    });

    const second = { ...first, record: dismissed, userId: "u2" };
    expect(resolveGuidedTourPresentation(second).kind).toBe("visible");
  });

  it("does not carry a student's dismissal over to the same person's teacher account", () => {
    const asStudent = freshStudent();
    const dismissed = withGuidedTourCompleted(asStudent.record!, "u1", STUDENT);
    const asTeacher = { ...asStudent, record: dismissed, role: "teacher" as const };
    expect(resolveGuidedTourPresentation(asTeacher).kind).toBe("visible");
  });
});

describe("step navigation", () => {
  it("advances one step at a time", () => {
    expect(nextGuidedTourStep(0, 3)).toBe(1);
    expect(nextGuidedTourStep(1, 3)).toBe(2);
  });

  it("clamps at the last step rather than running off the end", () => {
    expect(nextGuidedTourStep(2, 3)).toBe(2);
    expect(nextGuidedTourStep(9, 3)).toBe(2);
  });

  it("tolerates a negative or empty state", () => {
    expect(nextGuidedTourStep(-4, 3)).toBe(1);
    expect(nextGuidedTourStep(0, 0)).toBe(0);
  });

  it("knows which step commits", () => {
    expect(isLastGuidedTourStep(0, 3)).toBe(false);
    expect(isLastGuidedTourStep(2, 3)).toBe(true);
    expect(isLastGuidedTourStep(0, 0)).toBe(true);
  });

  it("labels the committing step differently from the others", () => {
    expect(guidedTourActionLabel(0, 3)).toBe("Devam");
    expect(guidedTourActionLabel(1, 3)).toBe("Devam");
    expect(guidedTourActionLabel(2, 3)).toBe("Başla");
  });

  it("walks a real authored tour from first card to commit", () => {
    const steps = GUIDED_TOUR_STEPS.student;
    let index = 0;
    const labels: string[] = [];
    while (!isLastGuidedTourStep(index, steps.length)) {
      labels.push(guidedTourActionLabel(index, steps.length));
      index = nextGuidedTourStep(index, steps.length);
    }
    labels.push(guidedTourActionLabel(index, steps.length));
    expect(labels).toEqual(["Devam", "Devam", "Başla"]);
    expect(index).toBe(steps.length - 1);
  });
});
