// Extracted purely so the double-click/duplicate-invocation guard used by
// resend/signOut in useEmailVerification.ts is directly unit-testable
// without a React hook-testing harness (this codebase has none — see
// tests/unit/guardedAction.test.ts). A ref-backed boolean is used (not
// React state) because state updates aren't synchronous: two taps in the
// same tick could both read a stale `false` before either re-render lands.
export interface OnceGuardRef {
  current: boolean;
}

// Runs `action` only if not already running; a call that arrives while one
// is in flight is a silent no-op (returns undefined) rather than queuing or
// erroring — matches the existing resend() behavior this was extracted from.
export async function runGuardedOnce<T>(
  guardRef: OnceGuardRef,
  action: () => Promise<T>,
): Promise<T | undefined> {
  if (guardRef.current) return undefined;
  guardRef.current = true;
  try {
    return await action();
  } finally {
    guardRef.current = false;
  }
}
