import fs from "fs";
import path from "path";

// Phase 95 — the answerCount contract, pinned in source.
//
// WHY A STRUCTURAL TEST
//
// questions/{id}.answerCount is MATERIALIZED state, not the canonical fact.
// The canonical fact is the set of answer documents; the field is a cached
// count so a feed card can show "3 cevap" without loading them. Phase 95
// audited every writer and reader and found the arrangement correct for the
// operations the product actually supports — an answer can be created and
// never removed, so a counter that only increments is exactly right.
//
// That correctness rests on a precondition, not on the counter's own logic:
// THERE IS NO SUPPORTED WAY TO REMOVE AN ANSWER. Phase 94 closed the unused
// client delete right; there is no delete affordance, no client service, no
// Cloud Function, and the moderation state machine's `approved -> removed`
// transition is reachable only from its own unit test. `onAnswerCreate`
// increments and nothing decrements, which is consistent precisely because
// nothing removes.
//
// The day someone adds answer removal, that precondition dies quietly. The
// count would overstate reality forever with no error anywhere, and the first
// person to notice would be a user looking at a feed card. This test is the
// alarm: it fails the moment a removal path appears without the decrement
// contract that must come with it. It is modelled on firestoreIndexes.test.ts,
// which pins a config invariant after a production incident for the same
// reason — some invariants cannot be expressed in the code they protect.
//
// It deliberately asserts a SMALL number of coarse facts. A test that matched
// implementation detail would break on harmless edits and get deleted.

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

/** Source with line comments stripped, so prose mentioning a symbol is not
 *  mistaken for code using it. Block comments are left alone — none of the
 *  patterns below appear inside one. */
function code(text: string): string {
  return text
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
    .join("\n");
}

const sources = readAll(FUNCTIONS_SRC).map((s) => ({ ...s, text: code(s.text) }));
const rel = (file: string) => path.relative(path.join(__dirname, "..", ".."), file);

describe("answerCount has exactly one increment path and no decrement", () => {
  it("only onAnswerCreate changes answerCount after a question is created", () => {
    const writers = sources
      .filter((s) => /answerCount\s*:/.test(s.text) || /answerCount["']?\s*[,)]/.test(s.text))
      .map((s) => rel(s.file))
      .sort();

    // createQuestion establishes the field at 0; onAnswerCreate is the only
    // thing that moves it afterwards. Anything else is new and needs a look.
    expect(writers).toEqual([
      "functions/src/answers/onAnswerCreate.ts",
      "functions/src/questions/createQuestion.ts",
    ]);
  });

  it("no Cloud Function decrements answerCount", () => {
    const decrementers = sources
      .filter((s) => /answerCount[\s\S]{0,80}increment\(\s*-/.test(s.text))
      .map((s) => rel(s.file));
    expect(decrementers).toEqual([]);
  });
});

describe("the precondition that makes an increment-only counter correct", () => {
  it("no Cloud Function deletes an answer document", () => {
    // If this fails, answer removal has arrived. Before shipping it, the
    // removal path must define: the answerCount decrement (floored, like
    // commentCounters), what happens to answerLikes, what happens to the
    // answer_created notification, whether moderation records are retained,
    // and whether a retried removal can decrement twice. Phase 93 did exactly
    // this work for comments; the same questions apply here.
    const deleters = sources.filter((s) =>
      /collection\(\s*["']answers["']\s*\)[\s\S]{0,120}\.delete\(/.test(s.text) ||
      /answerRef\s*\.delete\(/.test(s.text) ||
      /tx\.delete\(\s*answerRef/.test(s.text),
    );
    expect(deleters.map((s) => rel(s.file))).toEqual([]);
  });

  it("no Firestore trigger listens for answer deletion", () => {
    const triggers = sources.filter((s) =>
      /onDocumentDeleted\(\s*[\s\S]{0,60}answers\//.test(s.text),
    );
    // A delete trigger would be the natural home for the decrement — its
    // arrival means the counter contract changed, so this test should be
    // updated deliberately rather than deleted.
    expect(triggers.map((s) => rel(s.file))).toEqual([]);
  });

  it("firestore.rules still deny every client write to an answer", () => {
    // Phase 94 closed create, update and delete. If any of these reopens, a
    // client can move the answer set without the counter noticing.
    const rules = fs.readFileSync(path.join(__dirname, "..", "..", "firestore.rules"), "utf8");
    const answersBlock = rules.slice(
      rules.indexOf("match /answers/{answerId}"),
      rules.indexOf("match /questionLikes/{likeId}"),
    );
    expect(answersBlock).toContain("allow create: if false;");
    expect(answersBlock).toContain("allow update: if false;");
    expect(answersBlock).toContain("allow delete: if false;");
  });

  it("the moderation state machine's `removed` transition still has no caller", () => {
    // `approved -> removed` is declared legal, but nothing invokes
    // applyTransition outside the pure module. If a reviewer callable ever
    // withdraws published content, that IS an answer-removal path and the
    // counter contract above no longer holds.
    const callers = sources.filter(
      (s) => /applyTransition\(/.test(s.text) && !s.file.endsWith("moderationStates.ts"),
    );
    const exportsOnly = callers.every((s) => s.file.endsWith("index.ts"));
    expect(exportsOnly).toBe(true);
  });
});
