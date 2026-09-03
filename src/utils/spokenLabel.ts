// Joining label fragments into one sentence a screen reader can read.
//
// Phase 70 introduced this for the Concept Map's concept rows and Phase 71
// needs exactly the same rule for pattern rows, so it lives here rather than
// as two copies that could drift into two different spoken styles.
//
// The rule: fragments are already written as product copy, so most of them
// already end in a full stop. Blindly joining with ". " produced doubled
// stops ("Bu soruda 3 zorlanma kaydı var.. Son öğrenme kayıtlarında"), which
// a screen reader renders as an odd extra pause.

/** Joins non-empty fragments, adding a full stop only where one is missing. */
export function joinSpokenLabel(parts: readonly (string | null | undefined)[]): string {
  return parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .map((part) => {
      const trimmed = part.trim();
      return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
    })
    .join(" ");
}
