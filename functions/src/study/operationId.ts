// BACKEND IDEMPOTENCY for recordStudyOutcome.
//
// Why this exists: the client's double-tap ref-guard is a UI affordance, not
// an integrity guarantee. It does not survive a Firebase callable
// auto-retry, two devices submitting at once, or a flaky network where the
// response is lost but the write succeeded. Firestore transactions
// SERIALIZE concurrent writes — they do not deduplicate repeated intent, so
// two identical calls would legitimately bump attemptCount and
// totalReviewActions twice.
//
// Design: the client mints an operationId per user gesture. The last few
// processed ids are stored ON THE STUDY ITEM ITSELF (a bounded array), so:
//   * there is no unbounded global dedupe collection to grow or clean up,
//   * the ledger is automatically scoped per (user, question) — one
//     student's id can never collide with another's, because it is only
//     ever compared inside that student's own item document,
//   * the ledger is deleted along with the item by removeStudyItem.
//
// The window is small on purpose: it only needs to cover retries/races
// around a single gesture, not the item's whole lifetime.
export const MAX_TRACKED_OPERATION_IDS = 10;

// Format check only — this is a replay guard, not a security token. The uid
// is NEVER taken from the client (it comes from request.auth), so a guessed
// or copied operationId can only ever affect the guesser's own item.
const OPERATION_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export function isValidOperationId(value: unknown): value is string {
  return typeof value === "string" && OPERATION_ID_PATTERN.test(value);
}

// True when this exact operation was already applied to this item.
export function hasProcessedOperation(
  recentOperationIds: unknown,
  operationId: string,
): boolean {
  return Array.isArray(recentOperationIds) && recentOperationIds.includes(operationId);
}

// Newest-last, capped. Returning a new array (never mutating) keeps this
// pure and directly unit-testable.
export function appendOperationId(recentOperationIds: unknown, operationId: string): string[] {
  const existing = Array.isArray(recentOperationIds)
    ? recentOperationIds.filter((id): id is string => typeof id === "string")
    : [];
  if (existing.includes(operationId)) return existing.slice(-MAX_TRACKED_OPERATION_IDS);
  return [...existing, operationId].slice(-MAX_TRACKED_OPERATION_IDS);
}
