// Guards against a rapid double-tap running the SAME write twice.
//
// WHY A REF-BACKED LOCK AND NOT `if (isSubmitting) return`
// -------------------------------------------------------
// The obvious guard reads React state:
//
//   async function submit() {
//     if (isUploading) return;
//     setIsUploading(true);
//     ...
//   }
//
// A React event handler closes over the state value from the render that
// created it, and `setIsUploading(true)` only takes effect on the NEXT
// render. Two taps landing before that render commits therefore run two
// handlers that both read the stale `false` and both proceed. Disabling the
// button does not help either: the button becomes disabled on the same
// re-render the guard is waiting for.
//
// This is not a hypothetical — it is the exact failure createKeyedNavigationLock
// exists for on the navigation side ("the re-render caused by the first tap
// would hand the second tap a fresh, unlocked instance"), and the same shape
// the study feature already guards with submitLockRef for outcome writes.
//
// A mutable cell is the correct primitive because it updates synchronously,
// in the same tick as the tap, before React renders anything.
//
// WHY THIS IS NOT A REPLACEMENT FOR SERVER IDEMPOTENCY
// ---------------------------------------------------
// It is not, and must not be treated as one. Writes that carry an
// operationId (answers, comments, study outcomes) are protected by the
// BACKEND returning the original submission, which also covers a retry after
// a lost response — something no client lock can do. This lock is for the
// writes that have no such backstop, where a second run genuinely creates a
// second document.

export interface SubmitLock {
  /** True when the caller acquired the lock and should proceed. False when a
   *  run is already in flight. */
  acquire(): boolean;
  /** Always call from a `finally`, so a thrown write cannot strand the lock
   *  and permanently disable the control. */
  release(): void;
  isLocked(): boolean;
}

export function createSubmitLock(): SubmitLock {
  let inFlight = false;
  return {
    acquire(): boolean {
      if (inFlight) return false;
      inFlight = true;
      return true;
    },
    release(): void {
      inFlight = false;
    },
    isLocked(): boolean {
      return inFlight;
    },
  };
}
