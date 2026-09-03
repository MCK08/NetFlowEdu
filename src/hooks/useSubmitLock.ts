import { useRef } from "react";

import { createSubmitLock, SubmitLock } from "@utils/submitLock";

// Holds one SubmitLock stable for the component's whole life.
//
// The `useRef(createSubmitLock())` shorthand would allocate a throwaway lock
// on every render (React ignores the argument after the first), so the lock
// is built inside the null check — the same lazy init useNavigationGuard uses,
// and for the same reason.
//
// Deliberately NOT released on focus the way the navigation lock is: a write
// in flight is not finished just because the screen regained focus, and
// releasing there would reopen exactly the window this closes. Callers
// release in a `finally`.
export function useSubmitLock(): SubmitLock {
  const lockRef = useRef<SubmitLock | null>(null);
  if (lockRef.current === null) {
    lockRef.current = createSubmitLock();
  }
  return lockRef.current;
}
