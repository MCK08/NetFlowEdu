import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// STRUCTURAL INVARIANT: exactly one review-scheduling implementation exists,
// and it lives on the server.
//
// Phase 16 shipped a second copy of the algorithm under src/features/study/
// "for a parity test". It was never called by the app — but it was still a
// second production implementation, one edit away from silently disagreeing
// with the server about when a question is due. Phase 16C deleted it.
//
// A comment saying "don't add another one" does not survive contact with a
// future change. This test does: it fails the moment scheduling logic
// reappears on the client.

const REPO_ROOT = join(__dirname, "..", "..");
const CLIENT_ROOT = join(REPO_ROOT, "src");
const SERVER_SCHEDULER = join(REPO_ROOT, "functions", "src", "study", "reviewScheduler.ts");

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectFiles(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

const clientFiles = collectFiles(CLIENT_ROOT);
const clientSources = clientFiles.map((path) => ({
  path: path.slice(REPO_ROOT.length + 1).replace(/\\/g, "/"),
  text: readFileSync(path, "utf8"),
}));

describe("review scheduling has a single authority", () => {
  it("keeps the algorithm on the server", () => {
    // Sanity check that the thing we are asserting is unique actually exists,
    // so a rename cannot turn this whole suite into a vacuous pass.
    const server = readFileSync(SERVER_SCHEDULER, "utf8");
    expect(server).toContain("export function scheduleNextReview");
  });

  it("defines scheduleNextReview nowhere on the client", () => {
    const offenders = clientSources
      .filter(({ text }) => /function\s+scheduleNextReview|scheduleNextReview\s*=/.test(text))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("defines no scheduling interval constants on the client", () => {
    // These are the knobs that decide when a question comes back. A copy on
    // the client is exactly how the two sides start to disagree.
    const forbidden = [
      "AGAIN_DELAY_MINUTES",
      "STRUGGLED_INTERVAL_DAYS",
      "FIRST_SOLVED_INTERVAL_DAYS",
      "SOLVED_INTERVAL_MULTIPLIER",
      "MIN_SOLVED_INTERVAL_DAYS",
      "MAX_INTERVAL_DAYS",
      "MASTERY_MIN_SUCCESSFUL_REVIEWS",
      "MASTERY_MIN_INTERVAL_DAYS",
    ];
    const offenders: string[] = [];
    for (const { path, text } of clientSources) {
      for (const name of forbidden) {
        // `const NAME =` — a definition, not a mention in prose.
        if (new RegExp(`const\\s+${name}\\s*[=:]`).test(text)) offenders.push(`${path}:${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("computes no day keys or streaks on the client", () => {
    // The server owns the clock (functions/src/study/dayKey.ts): a client
    // day key would let a device timezone change fabricate a streak.
    const offenders = clientSources
      .filter(({ text }) => /function\s+(toDayKey|advanceStreak)\b/.test(text))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("has no client file importing a deleted local scheduler", () => {
    const offenders = clientSources
      .filter(({ text }) => /from\s+["'][^"']*(domain\/reviewScheduler|domain\/dayKey)["']/.test(text))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("ships no scheduling code in the client bundle", () => {
    // The strongest form of the check: ask the compiler, not a regex. The
    // client's study types module must contain types and guards only, so
    // emitting it produces no scheduling arithmetic.
    const emitted = execFileSync(
      process.execPath,
      [
        join(REPO_ROOT, "node_modules", "typescript", "lib", "tsc.js"),
        "--outFile",
        join(REPO_ROOT, "node_modules", ".cache", "study-types-emit.js"),
        "--module",
        "system",
        "--target",
        "es2019",
        "--moduleResolution",
        "node",
        "--skipLibCheck",
        // Comments mention the fields on purpose (they document WHY the
        // client no longer computes them); the assertion below is about
        // emitted CODE, so strip them rather than weaken the pattern.
        "--removeComments",
        join(CLIENT_ROOT, "features", "study", "domain", "studyTypes.ts"),
      ],
      { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    expect(emitted).toBe("");
    const output = readFileSync(
      join(REPO_ROOT, "node_modules", ".cache", "study-types-emit.js"),
      "utf8",
    );
    // No interval maths, no mastery thresholds — only the enums and guards.
    expect(output).not.toMatch(/86400000|MASTERY|INTERVAL|nextReviewAt/);
    expect(output).toContain("isStudyStatus");
  });
});
