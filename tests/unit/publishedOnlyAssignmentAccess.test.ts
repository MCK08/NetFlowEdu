import { readFileSync } from "fs";
import { join } from "path";

import {
  isAssignmentDeliveredToStudents,
  resolveAssignmentSessionAccess,
} from "../../src/features/assignments/services/assignmentStatus";

// Phase 131 — STUDENT ACCESS = PUBLISHED ONLY.
//
// Phase 129 made the app show a student only what had been published, and
// said so in its own comment: it was product behaviour, not a boundary.
// A targeted student could still read a draft, and write progress against
// it, straight out of Firestore. Phase 131 moves the boundary into
// firestore.rules — and that forces the query to change with it, because
// rules are not a post-filter: a query is allowed only if every document it
// COULD return is provably readable.
//
// The real proof is tests/integration/firestore.rules.test.ts, which runs
// the rules against the emulator. This file is the net in the FAST suite —
// `npm run verify` runs jest but not test:rules, so without it a query
// rewritten back to its old shape would reach a reviewer green, and the
// student's own screen would break on a rules denial rather than in CI.
//
// What it pins: the three layers say the same sentence, and the one error
// that now has a new cause is classified rather than shown as retryable.

const ROOT = join(__dirname, "..", "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");
const code = (relative: string) =>
  read(relative)
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("{/*");
    })
    .join("\n");

const RULES = "firestore.rules";
const INDEXES = "firestore.indexes.json";
const SERVICE = "src/features/assignments/services/assignmentService.ts";
const STATUS = "src/features/assignments/services/assignmentStatus.ts";
const SESSION_HOOK = "src/features/assignments/hooks/useAssignmentSession.ts";
const STUDENT_LIST_HOOK = "src/features/assignments/hooks/useStudentAssignments.ts";

// The assignment rules block, isolated so a `status == 'published'` written
// for some unrelated collection can never satisfy these assertions.
function assignmentRulesBlock(): string {
  const rules = read(RULES);
  const start = rules.indexOf("match /assignments/{assignmentId} {");
  const end = rules.indexOf("match /{document=**}", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return rules.slice(start, end);
}

describe("Phase 131 — layer 1: the Firestore rule is the boundary", () => {
  it("lets a targeted student read an assignment only while it is published", () => {
    expect(assignmentRulesBlock()).toContain(
      "(uid() in resource.data.targetStudentIds\n                           && resource.data.status == 'published')",
    );
  });

  it("keeps target membership as well — published is ANDed on, never substituted", () => {
    const block = assignmentRulesBlock();
    expect(block).toContain("uid() in resource.data.targetStudentIds");
    // The student branch must not have become a bare status test.
    expect(block).not.toMatch(/\|\|\s*resource\.data\.status == 'published'/);
  });

  it("does not apply the published condition to the teacher branch", () => {
    // The teacher owns the draft lifecycle; their branch reads every status.
    expect(assignmentRulesBlock()).toContain(
      "(isTeacher() && classData(resource.data.classId).teacherId == uid())",
    );
  });

  it("gates a student's own submission read on the parent being published", () => {
    const rules = read(RULES);
    expect(rules).toContain(
      "(isOwner(studentId) && assignmentData(assignmentId).status == 'published')",
    );
  });

  it("gates submission create AND update on the parent being published", () => {
    const rules = read(RULES);
    const block = rules.slice(rules.indexOf("match /assignments/{assignmentId}/submissions/{studentId} {"));
    const write = block.slice(block.indexOf("allow create, update:"));
    expect(write).toContain("assignmentData(assignmentId).status == 'published'");
    // The authorization that was already there has to survive alongside it.
    expect(write).toContain("studentId == uid()");
    expect(write).toContain("studentId in assignmentData(assignmentId).targetStudentIds");
  });

  it("resolves the parent through the one existing helper, so no second get() is introduced", () => {
    const rules = read(RULES);
    const block = rules.slice(rules.indexOf("match /assignments/{assignmentId}/submissions/{studentId} {"));
    // Every parent lookup in the submissions block goes through
    // assignmentData(...), which Firestore caches per document per request.
    expect(block).not.toMatch(/get\(\/databases\/\$\(database\)\/documents\/assignments\//);
  });
});

describe("Phase 131 — layer 2: the query is what makes the rule provable", () => {
  it("constrains the student assignment query to published, server-side", () => {
    const service = code(SERVICE);
    const fn = service.slice(service.indexOf("export async function getStudentAssignments"));
    expect(fn).toContain('where("targetStudentIds", "array-contains", uid)');
    expect(fn).toContain('where("status", "==", "published")');
  });

  it("carries the composite index for that exact query shape", () => {
    const indexes = JSON.parse(read(INDEXES)) as {
      indexes: { collectionGroup: string; fields: { fieldPath: string; arrayConfig?: string; order?: string }[] }[];
    };
    const match = indexes.indexes.filter(
      (index) =>
        index.collectionGroup === "assignments" &&
        index.fields.some((f) => f.fieldPath === "targetStudentIds" && f.arrayConfig === "CONTAINS") &&
        index.fields.some((f) => f.fieldPath === "status"),
    );
    // Exactly one — a duplicate index is a real cost, not a harmless extra.
    expect(match).toHaveLength(1);
    expect(match.map((index) => index.fields)).toEqual([
      [
        { fieldPath: "targetStudentIds", arrayConfig: "CONTAINS" },
        { fieldPath: "status", order: "ASCENDING" },
      ],
    ]);
  });

  it("leaves the teacher's own class query unconstrained by status", () => {
    const service = code(SERVICE);
    const fn = service.slice(
      service.indexOf("export async function getClassAssignments"),
      service.indexOf("export async function getStudentAssignments"),
    );
    expect(fn).toContain('where("classId", "==", classId)');
    expect(fn).not.toContain('where("status"');
  });
});

describe("Phase 131 — layer 3: the client guard stays as the vocabulary", () => {
  it("keeps the single delivery predicate meaning exactly published", () => {
    expect(isAssignmentDeliveredToStudents({ status: "published" })).toBe(true);
    expect(isAssignmentDeliveredToStudents({ status: "draft" })).toBe(false);
    expect(isAssignmentDeliveredToStudents({ status: "archived" })).toBe(false);
  });

  it("keeps the session access answers Phase 129 defined", () => {
    expect(resolveAssignmentSessionAccess(null)).toBe("not_found");
    expect(resolveAssignmentSessionAccess({ status: "draft" })).toBe("unavailable");
    expect(resolveAssignmentSessionAccess({ status: "archived" })).toBe("unavailable");
    expect(resolveAssignmentSessionAccess({ status: "published" })).toBe("open");
  });

  it("keeps the student list filtering before it reads any submission", () => {
    expect(code(STUDENT_LIST_HOOK)).toContain(
      "const assignments = (await getStudentAssignments(uid)).filter(isAssignmentDeliveredToStudents);",
    );
  });

  it("no longer claims in source that rules let a student read a draft", () => {
    // The Phase 129 comment said so, and after this phase it is false.
    expect(read(STATUS)).not.toContain("firestore.rules still");
  });
});

describe("Phase 131 — a denied draft is an answer, not a retryable failure", () => {
  it("maps permission-denied to the unavailable state rather than the error state", () => {
    const hook = code(SESSION_HOOK);
    const handler = hook.slice(hook.indexOf("} catch (cause) {"));
    expect(handler).toContain('const code = (cause as { code?: string }).code;');
    expect(handler).toContain('if (code === "permission-denied") {');
    // setUnavailable must be reached BEFORE the generic retryable message.
    expect(handler.indexOf("setUnavailable(true)")).toBeGreaterThan(-1);
    expect(handler.indexOf("setUnavailable(true)")).toBeLessThan(
      handler.indexOf('setError("Çalışma yüklenemedi.")'),
    );
  });

  it("still surfaces a genuine load failure as retryable", () => {
    expect(code(SESSION_HOOK)).toContain('setError("Çalışma yüklenemedi.");');
  });

  it("does not weaken the client write guard that Phase 129 added", () => {
    expect(code(SESSION_HOOK)).toContain("if (!deliveredRef.current) return;");
  });
});

describe("Phase 131 — scope", () => {
  it("adds no new collection, Cloud Function or listener to the assignment path", () => {
    const service = code(SERVICE);
    expect(service).not.toContain("onSnapshot");
    expect(service).not.toContain("httpsCallable");
    expect(code(SESSION_HOOK)).not.toContain("onSnapshot");
    expect(code(STUDENT_LIST_HOOK)).not.toContain("onSnapshot");
  });

  it("leaves the student solving session's own reads unchanged in number", () => {
    // Availability first, then submission + questions together — the Phase
    // 129/130 shape. Nothing here added a read to pay for the new boundary.
    const hook = code(SESSION_HOOK);
    expect(hook).toContain("const assignment = await getAssignmentById(assignmentId);");
    expect(hook).toContain("const [mySubmission, metadata] = await Promise.all([");
  });
});
