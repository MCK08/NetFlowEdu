import fs from "fs";
import path from "path";

import { dedupeQuestionsById } from "../../src/features/classes/services/classFeedPagination";

// Phase 103 — found on the simulator in the student class detail: every class
// question rendered twice and React reported duplicate keys. A short list
// reaches its end on first render, so FlatList fires onEndReached while the
// first page is still in flight; the cursor is still null, so loadMore fetched
// page 1 again and appended it. Two hooks shared the pattern.

const root = path.join(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

const HOOKS = [
  "src/features/classes/hooks/useClassQuestions.ts",
  "src/features/profile/hooks/useQuestionArchive.ts",
];

describe.each(HOOKS)("%s", (rel) => {
  const src = read(rel);

  it("does not page while the first page is still loading", () => {
    expect(src).toContain("const initialLoadInFlightRef = useRef(false);");
    expect(src).toMatch(/loadMore = useCallback\(async \(\) => \{\s*if \([^)]*initialLoadInFlightRef\.current\) return;/);
    // Set before the first fetch, cleared in finally for the current generation only.
    expect(src).toMatch(/initialLoadInFlightRef\.current = true;\s*setIsLoading\(true\);/);
    expect(src).toMatch(/finally \{\s*if \(generation === generationRef\.current\) \{\s*initialLoadInFlightRef\.current = false;/);
  });

  it("de-duplicates by id whenever it appends a page", () => {
    expect(src).toContain("dedupeQuestionsById([...prev, ...page.questions])");
    expect(src).not.toMatch(/setQuestions\(\(prev\) => \[\.\.\.prev, \.\.\.page\.questions\]\)/);
  });
});

describe("the dedupe the hooks rely on", () => {
  const q = (id: string) => ({ id }) as never;

  it("keeps the first occurrence and the original order", () => {
    const out = dedupeQuestionsById([q("a"), q("b"), q("a"), q("c"), q("b")]);
    expect(out.map((x: { id: string }) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("turns the exact bug — page 1 appended to itself — back into page 1", () => {
    const page = ["demo-q-heavy", "demo-q-light", "demo-q-mc-1", "demo-q-int-1"].map(q);
    expect(dedupeQuestionsById([...page, ...page])).toEqual(page);
  });

  it("de-duplicates a prepended question already in the list", () => {
    const list = [q("a"), q("b")];
    expect(dedupeQuestionsById([q("a"), ...list]).map((x: { id: string }) => x.id)).toEqual(["a", "b"]);
  });
});
