// Phase 74 — the reading-width scale, promoted out of five screens that had
// each declared their own copy.
//
// `MAX_CONTENT_WIDTH = 680` was already the de facto convention (Concept
// Mastery Map, Struggle Patterns, Student Learning Story and both feeds had
// identical local constants), but because it was copied rather than shared,
// the surfaces that never got a copy — the Study Hub, Class Performance,
// Student Performance — stretched edge-to-edge on a desktop window while the
// screens they navigate to stayed capped. Moving between them visibly changed
// the product's measure, which is the single clearest way a set of good
// screens still reads as separate apps.
//
// Two roles, not one number: prose/cards and a credential form want different
// measures, and collapsing them would make the auth form span a full 680.

export const contentWidth = {
  // Long-form reading and card stacks. ~90 characters at the body scale —
  // the width the Phase 70-73 surfaces were already built and QA'd at.
  readable: 680,
  // Auth and other short credential forms. Matches AuthShell's existing 440.
  form: 440,
} as const;

export type ContentWidthToken = keyof typeof contentWidth;
