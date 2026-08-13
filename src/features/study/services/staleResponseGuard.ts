// Whether an async response tagged with `requestId` may still be applied to
// state, given the LATEST request id the caller has since moved on to.
//
// Centralizes the "is this response stale" comparison that
// useStudyQueue.ts, useReviewSession.ts, useAdaptiveStudySession.ts, and
// useClassPerformance.ts each already make inline (a generation/requestId
// ref bumped per request, compared against the value captured when THIS
// request started) — extracted into one named, tested function so the
// exact race that caused a real bug elsewhere (useSocialFeed.loadMore:
// request A starts, request B starts and supersedes it, B resolves, A
// resolves LATE and its now-stale data must never overwrite B's) is
// directly provable without needing to render a React hook, which this
// repo has no test infrastructure for.
//
// Deliberately NOT safe to use for gating an in-flight/loading flag's own
// reset — a call's OWN flag must always clear once ITS OWN fetch settles,
// regardless of whether a newer request has since started. Gating that the
// same way is exactly what left useSocialFeed's isLoadingMore stuck true
// forever whenever a refresh() raced an in-flight loadMore() (see that
// fix's own doc comment), and is the same bug useReviewSession.loadMore
// had until this pass — see its own comment on why its finally block does
// NOT call this function for the loading-flag reset.
export function shouldApplyStaleResponse(requestId: number, currentRequestId: number): boolean {
  return requestId === currentRequestId;
}
