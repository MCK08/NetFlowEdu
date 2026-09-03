// Phase 75 — which single panel a learning-story screen shows, and in what
// order the cases win.
//
// This exists because both story screens got the order wrong in the same way:
// they read one hook's `isLoading`, ignored the other's `error`, and fell
// through to the first-run empty state whenever `items` happened to be empty.
// The result was the product telling a student "Henüz anlatacak bir hikâye
// yok" — a claim about THEIR evidence — at moments when the truth was that we
// had failed to load it, or had not finished loading it.
//
// The precedence below is the whole point, so it is stated once here instead
// of being re-derived as a ternary chain on each screen:
//
//   1. Still loading with nothing to show   -> loading. Never guess early.
//   2. Failed with nothing to show          -> error. Ours, and said as ours.
//   3. Nothing to show, nothing went wrong  -> empty. The only case where a
//                                              statement about the learner is
//                                              honest.
//   4. Otherwise                            -> content.
//
// Cases 1 and 2 are deliberately conditioned on having nothing to show: a
// refresh that fails while previous content is on screen should leave that
// content in place (with the error reported alongside it), not blank the
// screen. That is why `hasContent` gates them rather than `isLoading`/`hasError`
// alone.

export type StoryPanel = "loading" | "error" | "empty" | "content";

export interface StoryPanelInput {
  isLoading: boolean;
  hasError: boolean;
  /** Whether any evidence is currently held — items, cards, moments. */
  hasContent: boolean;
  /** The screen's own "there is genuinely nothing to tell yet" verdict. */
  isFirstRun: boolean;
}

export function resolveStoryPanel(input: StoryPanelInput): StoryPanel {
  if (!input.hasContent) {
    if (input.isLoading) return "loading";
    if (input.hasError) return "error";
    if (input.isFirstRun) return "empty";
  }
  return "content";
}
