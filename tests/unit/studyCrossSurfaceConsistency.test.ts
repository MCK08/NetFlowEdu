import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { StudyStatus, STUDY_STATUSES } from "../../src/features/study/domain/studyTypes";
import {
  parseStudyItem,
  toHydratedStudyItem,
} from "../../src/features/study/services/studyItemParser";
import { studyStatusLabel } from "../../src/features/study/services/studyPresentation";
import { summarizeStudyState } from "../../src/features/study/services/studyStatePresentation";

// A student meets the same question in three places: question detail, the
// class feed, and the review queue. The product requirement is that the
// question's state is described the SAME way in all three — otherwise the
// same item reads as "Tekrarda" on one screen and something else on another,
// and the student cannot tell whether they are looking at one state or two.

const REPO_ROOT = join(__dirname, "..", "..");

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectFiles(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

// Comments are stripped before scanning: these assertions are about copy the
// student actually SEES. A comment that quotes the old wording in order to
// explain why it was removed is documentation, not a second string in the UI.
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

const clientSources = collectFiles(join(REPO_ROOT, "src")).map((path) => ({
  path: path.slice(REPO_ROOT.length + 1).replace(/\\/g, "/"),
  text: stripComments(readFileSync(path, "utf8")),
}));

describe("status vocabulary has one source", () => {
  it.each(STUDY_STATUSES)("summarizes %s with the shared label", (status: StudyStatus) => {
    const item = parseStudyItem("q1", { status, nextReviewAt: null });
    expect(summarizeStudyState(item, Date.now()).statusLabel).toBe(studyStatusLabel(status));
  });

  it("defines the Turkish status labels in exactly one module", () => {
    // A second map is how "review" came to render as "Tekrarda" on the queue
    // card and "Tekrar aşamasında" under the question.
    const offenders = clientSources
      .filter(({ text }) => /["']Ustalaşıldı["']/.test(text))
      .map(({ path }) => path);
    expect(offenders).toEqual(["src/features/study/services/studyPresentation.ts"]);
  });

  it("never renders a raw enum value to the student", () => {
    for (const status of STUDY_STATUSES) {
      const label = studyStatusLabel(status);
      expect(label).not.toBe(status);
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

describe("every surface uses the one shared control", () => {
  const surfaces = [
    "src/features/questions/screens/QuestionDetailScreen.tsx",
    "src/features/classes/screens/ClassFeedScreen.tsx",
    "src/features/study/screens/ReviewSessionScreen.tsx",
    "src/features/study/components/StudyQueueCard.tsx",
  ];

  it.each(surfaces)("%s renders StudyOutcomeControls", (path) => {
    const source = clientSources.find((file) => file.path === path);
    expect(source).toBeDefined();
    expect(source?.text).toContain("<StudyOutcomeControls");
  });

  it("leaves StudyOutcomeButtons with a single consumer", () => {
    // The low-level buttons are an implementation detail of the control. A
    // second direct consumer is how a surface starts drifting on wording or
    // on whether prior state is shown at all.
    const consumers = clientSources
      .filter(({ text }) => /<StudyOutcomeButtons/.test(text))
      .map(({ path }) => path);
    expect(consumers).toEqual(["src/features/study/components/StudyOutcomeControls.tsx"]);
  });

  it("asks the self-assessment question in exactly one wording", () => {
    const prompts = new Set<string>();
    for (const { text } of clientSources) {
      for (const match of text.matchAll(/["'`](Bu soruyu[^"'`]*\?)["'`]/g)) {
        if (match[1]) prompts.add(match[1]);
      }
    }
    expect([...prompts]).toEqual(["Bu soruyu nasıl çözdün?"]);
  });
});

describe("queue items and hydrated items describe state identically", () => {
  // The queue reaches state through a paginated query and the question
  // surfaces through a single-document read. Different routes, one
  // description.
  const queueItem = {
    questionId: "q1",
    status: "review" as const,
    lastOutcome: "struggled" as const,
    intervalDays: 4,
    successfulReviews: 2,
    attemptCount: 5,
    nextReviewAt: 1_700_000_000_000,
    lastReviewedAt: 1_699_000_000_000,
    source: "class" as const,
    sourceClassId: "c1",
  };

  it("produces the same summary from either route", () => {
    const now = 1_699_500_000_000;
    const fromQueue = summarizeStudyState(toHydratedStudyItem(queueItem), now);
    const fromDocument = summarizeStudyState(parseStudyItem("q1", queueItem), now);
    expect(fromQueue).toEqual(fromDocument);
  });

  it("drops queue-only fields rather than widening the control's contract", () => {
    const hydrated = toHydratedStudyItem(queueItem);
    expect(hydrated).not.toHaveProperty("lastReviewedAt");
    expect(hydrated).not.toHaveProperty("sourceClassId");
    expect(hydrated.questionId).toBe("q1");
    expect(hydrated.lastOutcome).toBe("struggled");
  });

  it("normalizes a corrupt queue value the same way a document read does", () => {
    const corrupt = { ...queueItem, intervalDays: -3, nextReviewAt: Number.NaN };
    expect(toHydratedStudyItem(corrupt).intervalDays).toBe(0);
    expect(toHydratedStudyItem(corrupt).nextReviewAt).toBeNull();
  });
});
