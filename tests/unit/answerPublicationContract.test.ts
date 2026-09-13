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
// THE OPERABILITY HALF: manual_review is currently TERMINAL. Phase 96 proved it
// at runtime — no reviewer callable is deployed, and a teacher, the author and
// an outsider all receive 403 patching a submission's status. That is not a
// defect in these tests' eyes; it is a product decision that has not been made
// (see PHASE96_VERIFIED_ANSWER_PUBLICATION_OPERABILITY.md). What these tests do
// is make sure the day it changes, it changes deliberately: if a reviewer path
// appears, the last block fails and whoever added it has to come here and say
// so.
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

describe("manual_review is terminal until a product decision says otherwise", () => {
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

  it("nothing outside the pure state module performs a moderation transition", () => {
    // If this fails, a review path has arrived. Before shipping it, decide and
    // write down: WHO may review (no moderation role exists today — the enum is
    // student / teacher / organization_admin / platform_admin), whether an
    // author may review their own submission, and whether approval reuses the
    // SAME publication logic as the automated path rather than a second one.
    const callers = sources.filter(
      (s) => /applyTransition\(/.test(s.text) && !s.file.endsWith("moderationStates.ts"),
    );
    expect(callers.map((s) => rel(s.file)).filter((f) => !f.endsWith("index.ts"))).toEqual([]);
  });

  it("no reviewer callable is exported", () => {
    const index = fs.readFileSync(path.join(FUNCTIONS_SRC, "index.ts"), "utf8");
    for (const name of ["reviewAnswerSubmission", "reviewSubmission", "approveAnswer",
      "rejectAnswer", "moderateAnswer", "withdrawContent"]) {
      expect(index).not.toContain(name);
    }
  });

  it("moderation submissions remain server-only for clients", () => {
    // A reviewer must never patch status directly; if a review path is built it
    // has to be a callable, as the rule's own comment already anticipates.
    const rules = fs.readFileSync(path.join(__dirname, "..", "..", "firestore.rules"), "utf8");
    const block = rules.slice(
      rules.indexOf("match /moderationSubmissions/{submissionId}"),
      rules.indexOf("match /moderationSubmissions/{submissionId}") + 1200,
    );
    expect(block).toContain("allow write: if false;");
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
