import { resolveStoryPanel, StoryPanelInput } from "@features/learningStory/services/storyPanel";

function input(overrides: Partial<StoryPanelInput> = {}): StoryPanelInput {
  return { isLoading: false, hasError: false, hasContent: false, isFirstRun: false, ...overrides };
}

describe("resolveStoryPanel", () => {
  it("shows the skeleton while the first load is still running", () => {
    expect(resolveStoryPanel(input({ isLoading: true, isFirstRun: true }))).toBe("loading");
  });

  it("does not guess 'no story yet' before loading finishes", () => {
    // The regression this whole module exists for: one hook settling before
    // the other left items empty with isLoading already false, and the screen
    // announced an empty story to a student who has one.
    expect(resolveStoryPanel(input({ isLoading: true, isFirstRun: true }))).not.toBe("empty");
  });

  it("reports a failed load as an error, never as an empty story", () => {
    expect(resolveStoryPanel(input({ hasError: true, isFirstRun: true }))).toBe("error");
  });

  it("keeps error ahead of empty even when the story says first run", () => {
    // §110 — a failed read must NOT produce legitimate-empty copy. Stated as
    // its own case because this is the one that lied about the learner.
    const panel = resolveStoryPanel(input({ hasError: true, isFirstRun: true, isLoading: false }));
    expect(panel).toBe("error");
    expect(panel).not.toBe("empty");
  });

  it("keeps loading ahead of error, so a retry in progress is not shouted about", () => {
    expect(resolveStoryPanel(input({ isLoading: true, hasError: true }))).toBe("loading");
  });

  it("shows the empty state only when nothing loaded and nothing failed", () => {
    expect(resolveStoryPanel(input({ isFirstRun: true }))).toBe("empty");
  });

  it("shows content whenever there is evidence to show", () => {
    expect(resolveStoryPanel(input({ hasContent: true }))).toBe("content");
  });

  it("keeps existing content on screen when a refresh is running", () => {
    // A pull-to-refresh must not blank a story the reader is looking at.
    expect(resolveStoryPanel(input({ hasContent: true, isLoading: true }))).toBe("content");
  });

  it("keeps existing content on screen when a refresh fails", () => {
    // The error is reported in its own banner alongside the content, rather
    // than replacing evidence that is still perfectly valid.
    expect(resolveStoryPanel(input({ hasContent: true, hasError: true }))).toBe("content");
  });

  it("never returns empty while content is held, even if the builder says first run", () => {
    expect(resolveStoryPanel(input({ hasContent: true, isFirstRun: true }))).toBe("content");
  });

  it("falls through to content when nothing is loading, failing, or first-run", () => {
    expect(resolveStoryPanel(input())).toBe("content");
  });

  // The full precedence table, so a future reorder of the branches fails here
  // rather than in a screenshot.
  it("resolves every combination in the documented order", () => {
    const cases: [Partial<StoryPanelInput>, string][] = [
      [{ isLoading: true, hasError: true, isFirstRun: true }, "loading"],
      [{ hasError: true, isFirstRun: true }, "error"],
      [{ hasError: true }, "error"],
      [{ isFirstRun: true }, "empty"],
      [{ hasContent: true, isLoading: true, hasError: true, isFirstRun: true }, "content"],
    ];
    for (const [overrides, expected] of cases) {
      expect(resolveStoryPanel(input(overrides))).toBe(expected);
    }
  });
});
