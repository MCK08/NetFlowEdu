// Who gets study controls in the class feed, and which question the feed
// hydrates state for.
//
// Both answers live here rather than inline in the screen so the rule that
// actually matters — inactive cards cost nothing — is a pure function that a
// test can break. The screen holds ONE study hook for the whole list (see
// ClassFeedScreen), so `activeStudyQuestionId` is literally the only input
// that can cause a Firestore read: if it stays null, no read happens at all.

interface ActiveStudyQuestionParams {
  questionIds: string[];
  activeIndex: number;
  isStudent: boolean;
}

/**
 * The question the feed should hydrate study state for — or null for "read
 * nothing".
 *
 * Returns null for a teacher: study items exist only for students, and
 * recordStudyOutcome rejects teachers outright, so opening the read would be
 * wasted work and showing the control would be a guaranteed error.
 *
 * Returns null for an out-of-range index, which is the real state during the
 * first render of an empty or still-loading feed.
 */
export function activeStudyQuestionId({
  questionIds,
  activeIndex,
  isStudent,
}: ActiveStudyQuestionParams): string | null {
  if (!isStudent) return null;
  if (!Number.isInteger(activeIndex) || activeIndex < 0) return null;
  return questionIds[activeIndex] ?? null;
}

/**
 * Whether the card at `index` renders the self-assessment controls.
 *
 * Exactly one card can satisfy this for a given activeIndex, which is what
 * keeps the feed at one hydration read regardless of how many cards
 * FlatList happens to have mounted.
 */
export function shouldShowStudyControls(params: {
  index: number;
  activeIndex: number;
  isStudent: boolean;
}): boolean {
  return params.isStudent && params.index === params.activeIndex;
}
