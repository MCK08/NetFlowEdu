// The lifecycle of one piece of user-generated content awaiting publication.
//
// SERVER-OWNED. A client never sends a state and never receives anything but
// the safe projection in safeStatusFor() — see firestore.rules, where every
// moderationSubmissions write is denied outright.
//
// The states exist because "is this safe" has three genuinely different
// answers, not two: yes, no, and "a human has to look". Collapsing the third
// into either of the others is what turns a moderation system into either a
// censor or a liability.

export type ModerationState =
  // Created; nothing has looked at it yet.
  | "pending"
  // Signals are being gathered (deterministic checks, and any configured
  // provider). Distinct from `pending` so a submission stuck mid-scan is
  // visibly different from one that was never picked up.
  | "scanning"
  // Cleared. The ONLY state in which a public entity may be created.
  | "approved"
  // Refused. No public entity is ever created, now or later.
  | "rejected"
  // Uncertain, or no provider was available to decide. Quarantined until a
  // human rules on it. This is the safe default, not an error.
  | "manual_review"
  // A reviewer withdrew content that had already been published.
  | "removed"
  // Scanning could not complete (provider timeout/outage). Retryable, and
  // deliberately NOT a synonym for approved — see canPublish below.
  | "failed";

export const MODERATION_STATES: readonly ModerationState[] = [
  "pending",
  "scanning",
  "approved",
  "rejected",
  "manual_review",
  "removed",
  "failed",
] as const;

export function isModerationState(value: unknown): value is ModerationState {
  return typeof value === "string" && (MODERATION_STATES as readonly string[]).includes(value);
}

// Which transitions are legal.
//
// Written as an explicit map rather than scattered `if` checks so that
// "can content go from rejected back to approved" has exactly one answer, in
// one place, that a test can read. Note what is absent:
//   * rejected -> approved     (a refusal is final; re-submission is a NEW
//                               submission, with its own audit trail)
//   * approved -> approved     (idempotent republication is handled by the
//                               publishedEntityId guard, NOT by re-running
//                               the transition — see canPublish)
//   * anything -> pending      (a submission never rewinds to unexamined)
const ALLOWED_TRANSITIONS: Record<ModerationState, readonly ModerationState[]> = {
  pending: ["scanning", "approved", "rejected", "manual_review", "failed"],
  // A failed scan may be retried, which re-enters scanning.
  scanning: ["approved", "rejected", "manual_review", "failed"],
  // Published content can still be withdrawn by a reviewer.
  approved: ["removed"],
  // Terminal. A reviewer may not quietly flip a refusal into a publication.
  rejected: [],
  // A human decides; they may also withdraw it later without publishing.
  manual_review: ["approved", "rejected", "removed"],
  // Terminal.
  removed: [],
  // Retry, or give up and send it to a human.
  failed: ["scanning", "manual_review", "rejected"],
};

export function canTransition(from: ModerationState, to: ModerationState): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Applies a transition, or returns null if it is illegal.
 *
 * Returning null rather than throwing keeps this pure and lets the caller
 * decide the failure mode — a callable turns it into `failed-precondition`,
 * a batch reviewer might skip and continue.
 */
export function applyTransition(
  from: ModerationState,
  to: ModerationState,
): ModerationState | null {
  return canTransition(from, to) ? to : null;
}

/**
 * Whether a submission in this state may create its public entity.
 *
 * The single most important predicate in this phase. `approved` is the only
 * true case — and in particular `failed` is false, which is what makes a
 * provider outage fail closed instead of silently publishing everything.
 */
export function canPublish(state: ModerationState): boolean {
  return state === "approved";
}

/** Whether a state can still change. Terminal states are never re-scanned. */
export function isTerminal(state: ModerationState): boolean {
  return (ALLOWED_TRANSITIONS[state] ?? []).length === 0;
}

// What the AUTHOR of a submission is allowed to learn about it.
//
// Deliberately coarser than the internal state: an author is told their
// content is being checked, but not whether a specific signal fired, what
// score it produced, or which rule matched. Telling them would turn the
// filter into an oracle they can tune against — the single most common way
// keyword moderation gets defeated.
export type AuthorVisibleStatus = "checking" | "published" | "in_review" | "not_published";

export function safeStatusFor(state: ModerationState): AuthorVisibleStatus {
  switch (state) {
    case "pending":
    case "scanning":
      return "checking";
    case "approved":
      return "published";
    case "manual_review":
      return "in_review";
    case "rejected":
    case "removed":
      return "not_published";
    case "failed":
      // Reported as "still checking", not as a failure: the author's correct
      // next action is to wait or retry, and naming an internal outage tells
      // them nothing useful.
      return "checking";
  }
}
