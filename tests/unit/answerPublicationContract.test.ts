import fs from "fs";
import path from "path";

import {
  combineModerationSignals,
  decideImageModeration,
  PROVIDER_UNAVAILABLE,
} from "../../functions/src/moderation";

// Phase 96 — the answer publication contract, pinned where it can be checked.
//
// Two things are being protected here, and they pull in opposite directions.
//
// THE SAFETY HALF: a provider that is missing, erroring, timing out or unsure
// must never result in publication. That is asserted directly against the
// decision function, because it is the one place where "we could not tell" is
// turned into an outcome, and the tempting bug — treating unavailable as clean
// so answers stop stalling — would look like a fix.
//
// THE OPERABILITY HALF: Phase 96 proved manual_review was TERMINAL — no
// reviewer callable, and a teacher, the author and an outsider all 403 patching
// a submission's status — and pinned that absence so the day it changed, it
// changed deliberately. Phase 97 made the product decision: the submission's
// canonical class teacher reviews, and no one else. The second block now pins
// THAT decision — who, through which path, sharing which finalizer — so a
// wider reviewer cannot arrive by accident either.
//
// Modelled on answerCountContract.test.ts and firestoreIndexes.test.ts — some
// invariants live in the absence of code, and absences are what review forgets
// to check.

describe("a provider that cannot answer never publishes", () => {
  it("an unavailable provider routes to manual_review, never approved", () => {
    const decision = decideImageModeration({
      provider: PROVIDER_UNAVAILABLE,
      extractedText: null,
      imageTextAvailable: false,
    });
    expect(decision.state).toBe("manual_review");
    expect(decision.state).not.toBe("approved");
    expect(decision.reason).toBe("provider_unavailable");
  });

  it("a provider with no OCR text still does not approve", () => {
    // Handwriting is exactly what an image classifier misses, so a clean
    // SafeSearch result on its own is not enough.
    const decision = decideImageModeration({
      provider: { outcome: "clean", categories: [], retryable: false },
      extractedText: null,
      imageTextAvailable: false,
    });
    expect(decision.state).toBe("manual_review");
    expect(decision.reason).toBe("no_ocr_provider");
  });

  it("an uncertain provider verdict does not approve", () => {
    const decision = decideImageModeration({
      provider: { outcome: "review", categories: ["adult_possible"], retryable: false },
      extractedText: { verdict: "clean", categories: [] },
      imageTextAvailable: true,
    });
    expect(decision.state).toBe("manual_review");
    expect(decision.reason).toBe("uncertain");
  });

  it("uncertain OCR text does not approve even when the image is clean", () => {
    const decision = decideImageModeration({
      provider: { outcome: "clean", categories: [], retryable: false },
      extractedText: { verdict: "review", categories: ["profanity_possible"] },
      imageTextAvailable: true,
    });
    expect(decision.state).toBe("manual_review");
  });

  it("only a clean image AND clean available OCR text approves", () => {
    const decision = decideImageModeration({
      provider: { outcome: "clean", categories: [], retryable: false },
      extractedText: { verdict: "clean", categories: [] },
      imageTextAvailable: true,
    });
    expect(decision.state).toBe("approved");
  });

  it("a blocking signal on either side rejects", () => {
    expect(
      decideImageModeration({
        provider: { outcome: "block", categories: ["adult"], retryable: false },
        extractedText: { verdict: "clean", categories: [] },
        imageTextAvailable: true,
      }).state,
    ).toBe("rejected");
    expect(
      decideImageModeration({
        provider: { outcome: "clean", categories: [], retryable: false },
        extractedText: { verdict: "block", categories: ["profanity"] },
        imageTextAvailable: true,
      }).state,
    ).toBe("rejected");
  });

  it("combining signals takes the worse one, never the average", () => {
    const combined = combineModerationSignals(
      { state: "approved", categories: [], reason: "clean_all_signals" },
      { state: "manual_review", categories: ["uncertain"], reason: "uncertain" },
    );
    expect(combined.state).toBe("manual_review");
  });
});

describe("manual_review is resolved by the class teacher, and only by them (Phase 97)", () => {
  const FUNCTIONS_SRC = path.join(__dirname, "..", "..", "functions", "src");

  function readAll(dir: string): { file: string; text: string }[] {
    const out: { file: string; text: string }[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...readAll(full));
      else if (entry.name.endsWith(".ts")) out.push({ file: full, text: fs.readFileSync(full, "utf8") });
    }
    return out;
  }
  /** Comment lines stripped, so prose about a symbol is not read as use of it. */
  const code = (text: string) =>
    text.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");

  const sources = readAll(FUNCTIONS_SRC).map((s) => ({ ...s, text: code(s.text) }));
  const rel = (file: string) => path.relative(path.join(__dirname, "..", ".."), file);
  const review = fs.readFileSync(path.join(FUNCTIONS_SRC, "review", "answerReview.ts"), "utf8");
  // Phase 98 — the authorization contract moved to one shared module so the
  // comment review path could not drift from the answer path.
  const authorization = fs.readFileSync(path.join(FUNCTIONS_SRC, "review", "reviewAuthorization.ts"), "utf8");

  it("exactly the review paths perform a moderation transition, and nothing else does", () => {
    // Phase 96 pinned this list as empty. Phase 97 made the product decision
    // it was waiting for — the class's canonical teacher reviews answers —
    // and Phase 98 applied the SAME decision to comments. Both go through the
    // same shared authorization. A third caller means a new reviewer or a
    // new content type, which must come back here and say which.
    const callers = sources.filter(
      (s) => /applyTransition\(/.test(s.text) && !s.file.endsWith("moderationStates.ts"),
    );
    expect(callers.map((s) => rel(s.file)).filter((f) => !f.endsWith("index.ts")).sort()).toEqual([
      "functions/src/review/answerReview.ts",
      "functions/src/review/commentReview.ts",
    ]);
  });

  it("the reviewer is the canonical class teacher, resolved from classes/{classId}.teacherId", () => {
    expect(authorization).toContain('collection("classes").doc(classId)');
    expect(authorization).toContain("teacherId !== callerUid");
    // No role check anywhere in the review path: not teacher-the-role, not
    // organization_admin, not platform_admin.
    expect(code(review + authorization)).not.toMatch(/organization_admin|platform_admin|isOrgAdmin|isPlatformAdmin/);
    // And the answer path actually goes through the shared check.
    expect(code(review)).toContain("assertMayReview(");
  });

  it("self-review is refused even for the class teacher", () => {
    expect(authorization).toContain("authorId === callerUid");
  });

  it("only manual_review is human-reviewable", () => {
    expect(authorization).toContain('HUMAN_REVIEWABLE_STATES: readonly ModerationState[] = ["manual_review"]');
  });

  it("the review callables are exported and nothing accepts a reviewer, author, class or status from the client", () => {
    const index = fs.readFileSync(path.join(FUNCTIONS_SRC, "index.ts"), "utf8");
    for (const name of ["listAnswerReviewQueue", "getAnswerReviewDetail", "reviewAnswerSubmission"]) {
      expect(index).toContain(name);
    }
    for (const forbidden of ["data?.reviewerId", "data?.authorId", "data?.status", "data?.ownerId", "data?.storagePath", "data?.questionId"]) {
      expect(review).not.toContain(forbidden);
    }
  });

  it("manual approval and automated approval share ONE finalizer", () => {
    const submit = code(fs.readFileSync(path.join(FUNCTIONS_SRC, "moderation", "submitAnswer.ts"), "utf8"));
    const manual = code(review);
    for (const fn of ["publishApprovedAnswerObject(", "finalizeApprovedAnswer("]) {
      expect(submit).toContain(fn);
      expect(manual).toContain(fn);
    }
    // Neither path spells the answer document itself any more.
    expect(submit).not.toContain("likeCount: 0");
    expect(manual).not.toContain("likeCount: 0");
    // (createQuestion spells a QUESTION's likeCount; only the answer's is at issue.)
    const finalizer = sources
      .filter((s) => /moderation|review/.test(rel(s.file)) && /likeCount: 0/.test(s.text))
      .map((s) => rel(s.file));
    expect(finalizer).toEqual(["functions/src/moderation/answerFinalization.ts"]);
  });

  it("the review path never touches counters, notifications or learning evidence", () => {
    const manual = code(review);
    expect(manual).not.toMatch(/answerCount|FieldValue\.increment|prepareNotification|commitNotification/);
    expect(manual).not.toMatch(/studyEvents|studyItems|semanticDefinitions/);
  });

  it("moderation submissions remain server-only for clients", () => {
    // A reviewer never patches status directly; the decision is a callable.
    const rules = fs.readFileSync(path.join(__dirname, "..", "..", "firestore.rules"), "utf8");
    const block = rules.slice(
      rules.indexOf("match /moderationSubmissions/{submissionId}"),
      rules.indexOf("match /moderationSubmissions/{submissionId}") + 1200,
    );
    expect(block).toContain("allow write: if false;");
  });

  it("the review queue query has its composite index", () => {
    const indexes = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "..", "firestore.indexes.json"), "utf8"),
    ) as { indexes: { collectionGroup: string; fields: { fieldPath: string; order?: string }[] }[] };
    const match = indexes.indexes.find(
      (i) =>
        i.collectionGroup === "moderationSubmissions" &&
        i.fields.map((f) => `${f.fieldPath}:${f.order}`).join(",") ===
          "classId:ASCENDING,targetType:ASCENDING,status:ASCENDING,createdAt:ASCENDING",
    );
    expect(match).toBeDefined();
  });
});

describe("the deployment prerequisite is documented", () => {
  it("FIREBASE_SETUP.md names the Vision requirement and the manual_review consequence", () => {
    // Phase 96 found the moderation prerequisite entirely absent from the
    // deployment guide: an operator could enable everything the document listed
    // and still have an answer surface that never publishes.
    const setup = fs.readFileSync(path.join(__dirname, "..", "..", "FIREBASE_SETUP.md"), "utf8");
    expect(setup).toContain("vision.googleapis.com");
    expect(setup).toContain("manual_review");
    expect(setup.toLowerCase()).toContain("fail-closed");
  });
});
