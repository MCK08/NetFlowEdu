import { UserRole } from "@/types/user";
import { OnboardingStatus } from "@utils/onboardingStatus";

// Phase 74 — the first-use orientation pass, and every decision it makes.
//
// NAMING: this repo already has an "onboarding", and it is a different thing.
// `OnboardingStatus` (pending/provisioning/complete) is the SERVER's account
// provisioning stage — the role grant that RouteGuard blocks on. This module
// is the product tour: three cards explaining what NetFlowEdu does, shown
// once, owned entirely by the device. The two are related only in that the
// tour must wait for the account one to finish (see the gate below), so the
// storage key is namespaced under `onboarding.tour` and every symbol here
// says `guidedTour` rather than `onboarding` on its own.
//
// Everything in this file is pure. The AsyncStorage round-trip lives in
// guidedTourStorage.ts, the React lifecycle in useGuidedTour.ts — the same
// split themeStorage/parseThemePreference and activeStudySessionStorage/
// activeStudySession already use, and for the same reason: the interesting
// decisions stay directly unit-testable without a device or a renderer.

export const GUIDED_TOUR_STORAGE_KEY = "netflowedu.onboarding.tour.v1";

export const GUIDED_TOUR_VERSION = 1;

// A device can accumulate accounts (the account switcher exists precisely so
// it does). Remembering every account that ever finished the tour would be an
// unbounded local list, so this keeps the most recent completions and evicts
// the rest. The cost of eviction is that the ninth-most-recent account sees
// the tour once more — a repeated 3-card intro, not lost work.
export const MAX_REMEMBERED_COMPLETIONS = 8;

/** Which tour a viewer gets. Not the same set as UserRole: the two admin
 *  roles have no authored tour, and inventing one for them would mean
 *  showing an explanation of a product they do not use. */
export type GuidedTourAudience = "student" | "teacher";

export interface GuidedTourStep {
  readonly title: string;
  readonly body: string;
}

// Copy rules, applied to every line below:
//
// - It describes what the product DOES, never what it understands. NetFlowEdu
//   records outcomes and reports what they support; it does not know what a
//   student is thinking, and the tour must not be the one place that claims
//   otherwise while every other surface is careful about it.
// - No promise of a result. No "başarını artırır", no guarantees.
// - "Kanıt" is the product's own word for accumulated outcomes (Learning
//   Story, Concept Mastery Map, the teacher surfaces) — the tour introduces
//   the vocabulary the rest of the app will keep using, rather than a
//   marketing synonym the student then never sees again.
export const GUIDED_TOUR_STEPS: Record<GuidedTourAudience, readonly GuidedTourStep[]> = {
  student: [
    {
      title: "Kendi akışında çalış",
      body: "Ödevlerin, tekrarların ve serbest çalışman aynı akışta. Yarım bıraktığın oturum, açtığında kaldığı yerden devam eder.",
    },
    {
      title: "Çözümlerin öğrenme kanıtına dönüşür",
      body: "Her cevap ve her tekrar kaydedilir. Bir konuda yeterli kanıt yoksa NetFlowEdu bunu tahmin etmez, açıkça “yeterli kanıt yok” der.",
    },
    {
      title: "Zorlandığın yerler geri gelir",
      body: "Kavram haritan ve tekrar önerilerin bu kanıttan oluşur. Bir kez yanlış yaptığın soru ile tekrar tekrar zorlandığın konu ayrı gösterilir.",
    },
  ],
  teacher: [
    {
      title: "Sınıfının öğrenme sinyalleri tek yerde",
      body: "Sınıf performansı, konu dağılımı ve öğrenci ilerlemesi aynı ekranda toplanır. Ayrı ayrı rapor açman gerekmez.",
    },
    {
      title: "Tekrar eden zorlanmayı ayırt et",
      body: "Tek seferlik bir hata ile tekrar eden zorlanma ayrı işaretlenir. Kanıt yetersizse başarı olarak sayılmaz, yetersiz olarak gösterilir.",
    },
    {
      title: "Öne çıkan aksiyonlara geç",
      body: "Aksiyon Merkezi, müdahale sonrası hangi öğrencinin takip gerektirdiğini önceliklendirir ve seni doğrudan ilgili ekrana götürür.",
    },
  ],
};

export interface GuidedTourCompletion {
  readonly userId: string;
  readonly audience: GuidedTourAudience;
}

export interface GuidedTourRecord {
  readonly version: number;
  /** Most recent first. Bounded by MAX_REMEMBERED_COMPLETIONS. */
  readonly completions: readonly GuidedTourCompletion[];
}

export const EMPTY_GUIDED_TOUR_RECORD: GuidedTourRecord = {
  version: GUIDED_TOUR_VERSION,
  completions: [],
};

function isAudience(value: unknown): value is GuidedTourAudience {
  return value === "student" || value === "teacher";
}

/** Never throws, and never guesses.
 *
 *  Anything unreadable — absent, malformed JSON, a future version, the wrong
 *  shape — resolves to "no completions recorded", which shows the tour again.
 *  That is the safe direction: re-showing a 3-card intro costs a skip tap,
 *  while a parser that treated garbage as "already done" would silently
 *  delete first-use orientation for everyone whose storage hiccuped. */
export function parseGuidedTourRecord(raw: string | null): GuidedTourRecord {
  if (!raw) return EMPTY_GUIDED_TOUR_RECORD;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_GUIDED_TOUR_RECORD;
  }

  if (typeof parsed !== "object" || parsed === null) return EMPTY_GUIDED_TOUR_RECORD;
  const candidate = parsed as { version?: unknown; completions?: unknown };

  // A record written by a LATER version may mean something this build cannot
  // interpret, so it is not read. It is also not deleted — see
  // guidedTourStorage.ts, which leaves an unreadable record in place rather
  // than overwriting a newer client's state.
  if (candidate.version !== GUIDED_TOUR_VERSION) return EMPTY_GUIDED_TOUR_RECORD;
  if (!Array.isArray(candidate.completions)) return EMPTY_GUIDED_TOUR_RECORD;

  const completions: GuidedTourCompletion[] = [];
  for (const entry of candidate.completions) {
    if (typeof entry !== "object" || entry === null) continue;
    const { userId, audience } = entry as { userId?: unknown; audience?: unknown };
    if (typeof userId !== "string" || userId.length === 0) continue;
    if (!isAudience(audience)) continue;
    completions.push({ userId, audience });
    if (completions.length >= MAX_REMEMBERED_COMPLETIONS) break;
  }

  return { version: GUIDED_TOUR_VERSION, completions };
}

export function serializeGuidedTourRecord(record: GuidedTourRecord): string {
  return JSON.stringify({
    version: GUIDED_TOUR_VERSION,
    completions: record.completions.slice(0, MAX_REMEMBERED_COMPLETIONS),
  });
}

/** Completion is scoped to BOTH the account and the audience.
 *
 *  A teacher who also holds a student account on the same device has not seen
 *  the student tour, and vice versa — the two explain different products. And
 *  a second student on a shared device has not seen anything just because the
 *  first one did. */
export function isGuidedTourComplete(
  record: GuidedTourRecord,
  userId: string,
  audience: GuidedTourAudience,
): boolean {
  return record.completions.some(
    (entry) => entry.userId === userId && entry.audience === audience,
  );
}

/** Records one completion, most-recent-first, deduplicated and bounded.
 *
 *  Re-completing an already-recorded pair moves it back to the front rather
 *  than appending a duplicate, so the eviction window measures distinct
 *  accounts rather than how many times someone replayed the tour. */
export function withGuidedTourCompleted(
  record: GuidedTourRecord,
  userId: string,
  audience: GuidedTourAudience,
): GuidedTourRecord {
  const rest = record.completions.filter(
    (entry) => !(entry.userId === userId && entry.audience === audience),
  );
  return {
    version: GUIDED_TOUR_VERSION,
    completions: [{ userId, audience }, ...rest].slice(0, MAX_REMEMBERED_COMPLETIONS),
  };
}

/** Drops one completion so the tour can be replayed from Profile. Leaves
 *  every other account's entry untouched. */
export function withGuidedTourReset(
  record: GuidedTourRecord,
  userId: string,
  audience: GuidedTourAudience,
): GuidedTourRecord {
  return {
    version: GUIDED_TOUR_VERSION,
    completions: record.completions.filter(
      (entry) => !(entry.userId === userId && entry.audience === audience),
    ),
  };
}

export function resolveGuidedTourAudience(role: UserRole | null): GuidedTourAudience | null {
  return role === "student" || role === "teacher" ? role : null;
}

export interface GuidedTourGateInput {
  /** False until the stored record has actually been read. Distinct from a
   *  record of `null`: "not looked yet" must not present anything. */
  recordLoaded: boolean;
  record: GuidedTourRecord | null;
  isAuthenticated: boolean;
  isEmailVerified: boolean;
  /** The SERVER's account provisioning stage, not this tour's. */
  accountOnboardingStatus: OnboardingStatus | null;
  role: UserRole | null;
  userId: string | null;
}

export type GuidedTourPresentation =
  | { readonly kind: "hidden" }
  | {
      readonly kind: "visible";
      readonly audience: GuidedTourAudience;
      readonly steps: readonly GuidedTourStep[];
    };

const HIDDEN: GuidedTourPresentation = { kind: "hidden" };

/** The single decision the overlay makes, and the reason it is a function
 *  rather than a chain of `&&` in a component.
 *
 *  This is deliberately NOT wired into decideRouteGuardTarget. That function
 *  is the app's most safety-critical one — exhaustively tested against a
 *  state x screen matrix and a redirect-loop simulator — and it is driven by
 *  synchronous auth state. Feeding it an asynchronously-loaded local value
 *  would introduce a window where the answer is genuinely unknown, and every
 *  way of filling that window is bad: route to the tour and a returning user
 *  sees it flash, route home and a new user sees home flash first, or block
 *  and every cold start waits on AsyncStorage.
 *
 *  So the tour is presented OVER the routed screen instead, exactly the way
 *  RouteGuard already overlays AuthBootstrapScreen rather than swapping the
 *  navigator's children. Routing is untouched, there is no new redirect that
 *  could loop, and the unknown window resolves to `hidden` — which is why
 *  `recordLoaded` is the first thing checked.
 *
 *  There is deliberately no separate "dismissed during this run" flag. Skip
 *  and finish both fold the completion into the in-memory record through
 *  withGuidedTourCompleted before the storage write is awaited, so a dismissal
 *  is already keyed by (account, audience) by construction. A bare session
 *  boolean would also have hidden the tour from the NEXT account switched to
 *  on the same run. */
export function resolveGuidedTourPresentation(
  input: GuidedTourGateInput,
): GuidedTourPresentation {
  if (!input.recordLoaded || input.record === null) return HIDDEN;
  if (!input.isAuthenticated || !input.isEmailVerified) return HIDDEN;
  // Until the server has finished granting the role, `role` is still the
  // onUserCreate default rather than what this account will actually be —
  // showing the student tour to a teacher mid-provisioning would be worse
  // than showing nothing for another second.
  if (input.accountOnboardingStatus !== "complete") return HIDDEN;

  const audience = resolveGuidedTourAudience(input.role);
  if (audience === null) return HIDDEN;
  if (!input.userId) return HIDDEN;
  if (isGuidedTourComplete(input.record, input.userId, audience)) return HIDDEN;

  return { kind: "visible", audience, steps: GUIDED_TOUR_STEPS[audience] };
}

/** Clamps to the last step rather than running past the end, so a double tap
 *  on the final "Başla" cannot index into nothing. */
export function nextGuidedTourStep(current: number, stepCount: number): number {
  if (stepCount <= 0) return 0;
  return Math.min(Math.max(current, 0) + 1, stepCount - 1);
}

export function isLastGuidedTourStep(current: number, stepCount: number): boolean {
  return stepCount <= 0 || current >= stepCount - 1;
}

/** The primary action's label. The last step commits, so it says so. */
export function guidedTourActionLabel(current: number, stepCount: number): string {
  return isLastGuidedTourStep(current, stepCount) ? "Başla" : "Devam";
}
