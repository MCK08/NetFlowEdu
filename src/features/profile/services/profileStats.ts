// A profile statistic is only ever one of three things, and conflating
// them is what produced the two real defects this replaces:
//
//   * "loading"     — not fetched yet. Must NOT render as 0.
//   * "unavailable" — genuinely not knowable from what this screen loaded.
//                     PublicProfileScreen previously rendered
//                     `questions.length` under a "Soru" label, but
//                     getUserPublicQuestions caps at limit(30), so a user
//                     with 50 public questions was shown "30" as if it
//                     were their total.
//   * "value"       — a real, complete number.
export type ProfileStatState =
  | { kind: "value"; value: number }
  | { kind: "loading" }
  | { kind: "unavailable" };

export interface ProfileStat {
  key: string;
  label: string;
  state: ProfileStatState;
}

// Placeholder shown for a stat that cannot be known — deliberately not "0".
export const UNAVAILABLE_STAT_TEXT = "—";

export function formatStatValue(state: ProfileStatState): string {
  if (state.kind === "value") return formatCount(state.value);
  return UNAVAILABLE_STAT_TEXT;
}

// Compact thousands so a four-digit score cannot break a three-across stat
// row on a small phone. Mirrors the feed's own count abbreviation ("B" is
// Turkish "bin").
export function formatCount(value: number): string {
  if (!Number.isFinite(value) || value < 0) return UNAVAILABLE_STAT_TEXT;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}B`;
  return String(value);
}

export function statValue(value: number | null | undefined): ProfileStatState {
  return typeof value === "number" ? { kind: "value", value } : { kind: "unavailable" };
}

// Own profile: friendCount and the two request counters all come from the
// same live socialMeta document, so they share one loading flag.
export function ownProfileStats(params: {
  friendCount: number;
  incomingRequestCount: number;
  totalPoints: number | null | undefined;
  isSocialMetaLoading: boolean;
}): ProfileStat[] {
  const social = (value: number): ProfileStatState =>
    params.isSocialMetaLoading ? { kind: "loading" } : { kind: "value", value };

  return [
    { key: "friends", label: "Arkadaş", state: social(params.friendCount) },
    { key: "requests", label: "Gelen İstek", state: social(params.incomingRequestCount) },
    { key: "points", label: "Puan", state: statValue(params.totalPoints) },
  ];
}

// Public profile: points come straight off the publicProfiles document.
// A question total is deliberately ABSENT — the only question data this
// screen loads is a capped, non-paginated page, which cannot honestly be
// labelled as a total.
export function publicProfileStats(params: {
  totalPoints: number | null | undefined;
  weeklyPoints: number | null | undefined;
  isLoading: boolean;
}): ProfileStat[] {
  const point = (value: number | null | undefined): ProfileStatState =>
    params.isLoading ? { kind: "loading" } : statValue(value);

  return [
    { key: "totalPoints", label: "Puan", state: point(params.totalPoints) },
    { key: "weeklyPoints", label: "Haftalık", state: point(params.weeklyPoints) },
  ];
}
