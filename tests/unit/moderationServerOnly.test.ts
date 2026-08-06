import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// STRUCTURAL INVARIANT: the moderation term list and its matcher never reach
// the client.
//
// Shipping them would hand an attacker a local oracle: edit a string, watch
// the app accept or refuse it, and iterate offline until something passes.
// That turns a keyword layer from "a speed bump" into "a solved puzzle".
//
// A comment saying "server only" does not survive a future import. This
// does — it fails the moment any file under src/ or app/ reaches the
// moderation internals, directly or transitively.

const REPO_ROOT = join(__dirname, "..", "..");

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectFiles(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

const clientSources = [
  ...collectFiles(join(REPO_ROOT, "src")),
  ...collectFiles(join(REPO_ROOT, "app")),
].map((path) => ({
  path: path.slice(REPO_ROOT.length + 1).replace(/\\/g, "/"),
  text: readFileSync(path, "utf8"),
}));

describe("moderation internals are server-only", () => {
  it("has the term list on the server, where this test can be meaningful", () => {
    // Guards against the whole suite passing vacuously after a rename.
    const rules = readFileSync(
      join(REPO_ROOT, "functions", "src", "moderation", "textRules.ts"),
      "utf8",
    );
    expect(rules).toContain("export function evaluateTextRules");
  });

  it("is never imported from client source", () => {
    const offenders = clientSources
      .filter(({ text }) => /from\s+["'][^"']*moderation\/(textRules|textNormalization|moderationDecision|providers)["']/.test(text))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("has no client file reaching into functions/ at all", () => {
    // The broader rule the one above is a special case of: the client and
    // the Cloud Functions codebase have separate dependency trees, so any
    // such import is both a leak and a build hazard.
    const offenders = clientSources
      .filter(({ text }) => /from\s+["'][^"']*\bfunctions\/src\//.test(text))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("defines no prohibited-term list in client source", () => {
    // Catches a copy-paste of the data itself, which an import check alone
    // would miss.
    const offenders: string[] = [];
    for (const { path, text } of clientSources) {
      if (/BLOCK_TOKENS|BLOCK_PHRASES|AMBIGUOUS_TOKENS|REVIEW_PHRASES/.test(text)) {
        offenders.push(path);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the deterministic matcher off the client", () => {
    const offenders = clientSources
      .filter(({ text }) => /function\s+evaluateTextRules|function\s+normalizeForModeration/.test(text))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });
});
