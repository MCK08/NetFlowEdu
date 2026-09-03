// Phase 72 — optional AUTHOR-WRITTEN progressive hints on a question.
//
// Pure, React/Firebase-free, exactly like multipleChoice.ts beside it: the
// write half (sanitizeHints) and the read half (parseHintsFromUnknown) live
// together so the two can never disagree about what a legal hint list is, and
// both are directly unit-testable without mocking Firestore.
//
// THE TRUST RULE
//
// Every hint a student sees was typed by the question's author. Nothing here
// generates, rewrites, expands or infers instructional content, and there is
// no model anywhere in this path. Phase 71 established that the repository has
// no misconception taxonomy; this phase does not quietly become one — an
// authored hint is a teaching prompt, not a label for what the student got
// wrong.
//
// WHY A PLAIN ORDERED LIST
//
// The ladder IS the order: hint 1 is the gentlest nudge, the last is the
// strongest scaffold. A list preserves exactly that and nothing more. Levels
// are positions, not stored labels, so an author cannot create a "level 3"
// with no level 1 — the shape makes that unrepresentable rather than needing a
// rule to forbid it.

// A small ladder on purpose. Three steps is enough to go from a nudge to a
// real scaffold, and a longer list would turn the question card into a
// worksheet — plus every extra hint is another chance to hand the answer over.
export const MAX_QUESTION_HINTS = 3;

// Shorter than a question's own description (capped at 300 by firestore.rules)
// because a hint is a prompt, not a worked solution. Long enough for a real
// sentence or two of guidance.
export const MAX_HINT_LENGTH = 200;

/** Raw author input -> what is actually worth persisting.
 *
 *  Trims every entry, drops blanks outright, and caps both the count and each
 *  entry's length. Dropping blanks is what keeps the ladder contiguous: an
 *  author who fills boxes 1 and 3 gets a two-step ladder, never a hole. */
export function sanitizeHints(raw: readonly (string | null | undefined)[] | null | undefined): string[] {
  if (!raw) return [];
  const cleaned: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length === 0) continue;
    cleaned.push(trimmed.slice(0, MAX_HINT_LENGTH));
    if (cleaned.length >= MAX_QUESTION_HINTS) break;
  }
  return cleaned;
}

/** The READ half — parses whatever a Firestore document actually holds.
 *
 *  Truly `unknown`: a pre-Phase-72 document has no `hints` field at all, and
 *  nothing stops a hand-edited or corrupted document from holding a garbage
 *  shape. A malformed entry is dropped rather than coerced, so a student can
 *  never be shown something that is not a real authored string. */
export function parseHintsFromUnknown(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return sanitizeHints(value as (string | null | undefined)[]);
}

/** True when this question actually carries authored support. */
export function hasHints(hints: readonly string[] | null | undefined): boolean {
  return Array.isArray(hints) && hints.length > 0;
}

/** How many hints remain unopened at a given reveal depth. */
export function remainingHintCount(hints: readonly string[], revealed: number): number {
  return Math.max(0, hints.length - Math.max(0, revealed));
}

/** The next reveal depth, never past the end of the ladder. */
export function nextRevealCount(hints: readonly string[], revealed: number): number {
  return Math.min(hints.length, Math.max(0, revealed) + 1);
}

/** The student-facing name of one rung. Position IS the level. */
export function hintLabel(index: number): string {
  return `İpucu ${index + 1}`;
}

/** The action label for the hint control at a given reveal depth.
 *
 *  Returns null once the whole ladder is open — there is nothing left to ask
 *  for, and leaving a dead "one more hint" button on screen would be a promise
 *  the question cannot keep. */
export function hintActionLabel(hints: readonly string[], revealed: number): string | null {
  if (remainingHintCount(hints, revealed) === 0) return null;
  return revealed === 0 ? "İpucu Al" : "Bir İpucu Daha";
}
