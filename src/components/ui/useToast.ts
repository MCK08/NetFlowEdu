import { useCallback, useRef, useState } from "react";

import { ToastVariant } from "./Toast";

const DEFAULT_DURATION_MS = 2500;

// Local (per-screen) toast state — pairs with <Toast message={...}/>.
// Deliberately not a global singleton/context: a screen that wants a toast
// renders its own <Toast> fed by this hook's `message`/`variant`, keeping
// this a presentational primitive rather than new app-wide plumbing.
export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const [variant, setVariant] = useState<ToastVariant>("neutral");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((text: string, toastVariant: ToastVariant = "neutral") => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVariant(toastVariant);
    setMessage(text);
    timeoutRef.current = setTimeout(() => setMessage(null), DEFAULT_DURATION_MS);
  }, []);

  return { message, variant, showToast };
}
