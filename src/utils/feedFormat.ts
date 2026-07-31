// Presentation-only formatting shared by the two feed cards (public feed +
// class feed). Pure functions, no React/Firebase — the counts and
// timestamps themselves come straight from the existing Question document,
// nothing here derives or fetches new data.

// Compact count for the fixed-width action rail: a four-digit like count
// would otherwise wrap and break the rail's alignment. "B" is Turkish
// "bin" (thousand) — the abbreviation ClassFeedCard already used before
// this was shared, kept identical so no visible count changes meaning.
export function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}B`;
  return String(value);
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

// "3 sa" style relative age, falling back to an absolute date once a
// question is older than a week (at that point "42 g" stops being useful
// and a real date reads better). `now` is injectable purely so this is
// testable without freezing the system clock.
export function formatRelativeTime(createdAt: number, now: number = Date.now()): string {
  if (!createdAt) return "";
  const elapsed = now - createdAt;
  // A clock skew (server timestamp slightly ahead of the device) must not
  // render "-1 dk" — anything not yet in the past reads as "şimdi".
  if (elapsed < MINUTE_MS) return "şimdi";
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)} dk`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)} sa`;
  if (elapsed < WEEK_MS) return `${Math.floor(elapsed / DAY_MS)} g`;
  return new Date(createdAt).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
