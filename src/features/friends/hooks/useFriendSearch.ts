import { useEffect, useRef, useState } from "react";

import { searchActiveUsersByUsername } from "@services/firebase/userSearch";
import { PublicProfile } from "@/types/publicProfile";

const DEBOUNCE_MS = 300;

// Backs FindFriendsScreen — debounced so each keystroke doesn't fire its
// own query, and stale-response-safe (a slow query for an earlier
// keystroke can never overwrite the result of a later one).
export function useFriendSearch(excludeUid: string | undefined) {
  const [queryText, setQueryText] = useState("");
  const [results, setResults] = useState<PublicProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const trimmed = queryText.trim();
    if (!trimmed || !excludeUid) {
      setResults([]);
      setIsLoading(false);
      setErrorMessage(null);
      return;
    }

    const thisRequestId = ++requestIdRef.current;
    setIsLoading(true);
    setErrorMessage(null);
    const timer = setTimeout(() => {
      searchActiveUsersByUsername(trimmed, excludeUid)
        .then((profiles) => {
          if (requestIdRef.current !== thisRequestId) return;
          setResults(profiles);
        })
        .catch(() => {
          if (requestIdRef.current !== thisRequestId) return;
          setErrorMessage("Arama yapılamadı. Lütfen tekrar deneyin.");
        })
        .finally(() => {
          if (requestIdRef.current !== thisRequestId) return;
          setIsLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [queryText, excludeUid]);

  return { queryText, setQueryText, results, isLoading, errorMessage };
}
