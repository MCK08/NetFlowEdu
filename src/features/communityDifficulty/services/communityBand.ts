import type { Ionicons } from "@expo/vector-icons";

import type { StatusTone } from "@components/ui/StatusLabel";

// Phase 108 — the client's reading of the anonymous community signal.
//
// The band itself is decided SERVER-side (functions/src/study/
// communityDifficulty.ts) from distinct-student counts and written into the
// questionStats document; the client never recomputes it and never sees a
// per-person fact. This module only turns a band into calm words and a
// mark. Pure, so the copy is pinned by tests.

export type CommunityBand = "challenging" | "average" | "light" | "insufficient";

export const COMMUNITY_BANDS: readonly CommunityBand[] = ["challenging", "average", "light", "insufficient"];

export function isCommunityBand(value: unknown): value is CommunityBand {
  return typeof value === "string" && (COMMUNITY_BANDS as readonly string[]).includes(value);
}

/** Anonymous aggregate for one question, as the client may see it. Counts
 *  are present only above the privacy floor; below it the client receives
 *  the band "insufficient" and nothing else. */
export interface CommunitySignal {
  band: CommunityBand;
  /** Distinct students who recorded an outcome — null below the floor. */
  cohortSize: number | null;
}

export const COMMUNITY_INSUFFICIENT_MESSAGE = "Topluluk karşılaştırması için henüz yeterli veri yok.";

export const COMMUNITY_BAND_LABEL: Readonly<Record<CommunityBand, string>> = {
  challenging: "Toplulukta zorlayıcı",
  average: "Toplulukta ortalama zorluk",
  light: "Toplulukta az zorlanma görüldü",
  insufficient: "Yeterli veri yok",
};

/** One calm sentence for the question screen. Reassurance, not pressure. */
export const COMMUNITY_BAND_SENTENCE: Readonly<Record<CommunityBand, string>> = {
  challenging: "Bu soru birçok öğrenciyi de zorladı.",
  average: "Bu soruda bazı öğrenciler de zorlandı.",
  light: "Bu soruda zorlanma az görüldü.",
  insufficient: COMMUNITY_INSUFFICIENT_MESSAGE,
};

export const COMMUNITY_BAND_ICON: Readonly<Record<CommunityBand, keyof typeof Ionicons.glyphMap>> = {
  challenging: "people-outline",
  average: "people-outline",
  light: "people-outline",
  insufficient: "help-circle-outline",
};

/** Never a danger colour: difficulty is a property of the question, not a
 *  verdict on the student, so nothing here is red. */
export const COMMUNITY_BAND_TONE: Readonly<Record<CommunityBand, StatusTone>> = {
  challenging: "primary",
  average: "neutral",
  light: "muted",
  insufficient: "muted",
};

/** How many people the band rests on, stated only above the floor. */
export function cohortSentence(signal: CommunitySignal): string | null {
  if (signal.band === "insufficient" || signal.cohortSize === null) return null;
  return `${signal.cohortSize} öğrencinin denemesine göre`;
}

// ── The caller's own relation on the discovery list ───────────────────────

export type OwnRelation = "retrying" | "solved_later" | "attempted" | "not_attempted";

export const OWN_RELATION_LABEL: Readonly<Record<OwnRelation, string>> = {
  retrying: "Sen de tekrar deniyorsun",
  solved_later: "Sonradan çözdün",
  attempted: "Denedin",
  not_attempted: "Henüz denemedin",
};

export const OWN_RELATION_ICON: Readonly<Record<OwnRelation, keyof typeof Ionicons.glyphMap>> = {
  retrying: "refresh-outline",
  solved_later: "checkmark-circle-outline",
  attempted: "ellipse-outline",
  not_attempted: "add-circle-outline",
};

export function isOwnRelation(value: unknown): value is OwnRelation {
  return value === "retrying" || value === "solved_later" || value === "attempted" || value === "not_attempted";
}
