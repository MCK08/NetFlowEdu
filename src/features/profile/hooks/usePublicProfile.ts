import { useCallback, useEffect, useState } from "react";

import { getPublicProfileOnce } from "@services/firebase/publicProfile";
import { PublicProfile } from "@/types/publicProfile";

const NOT_FOUND_MESSAGE = "Bu profil görüntülenemiyor.";
const LOAD_FAILED_MESSAGE = "Profil yüklenemedi. Bağlantını kontrol edip tekrar dene.";

interface PublicProfileState {
  profile: PublicProfile | null;
  isLoading: boolean;
  errorMessage: string | null;
  // Distinguishes "publicProfiles/{uid} genuinely does not exist" (a
  // deleted or suspended account — retrying cannot help) from "the read
  // failed" (offline, permission hiccup — retrying is exactly the right
  // move). Both previously collapsed into the single NOT_FOUND_MESSAGE, so
  // a user with no signal was told the profile did not exist.
  isNotFound: boolean;
  retry: () => void;
}

// Distinct from useProfileHandle (the cache used on feed/answer cards) —
// this screen needs an explicit "not found / unavailable" state to show a
// real error, not a silent "Kullanıcı" fallback.
//
// The Firestore read itself is unchanged: one getPublicProfileOnce call
// per userId, no listener, no extra query.
export function usePublicProfile(userId: string | undefined): PublicProfileState {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);
  // Bumped by retry() to re-run the effect without duplicating the fetch
  // logic in a second code path.
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setIsLoading(false);
      setIsNotFound(true);
      setErrorMessage(NOT_FOUND_MESSAGE);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);
    setIsNotFound(false);

    getPublicProfileOnce(userId)
      .then((result) => {
        if (cancelled) return;
        // Resolving with null means the document really is absent.
        if (!result) {
          setIsNotFound(true);
          setErrorMessage(NOT_FOUND_MESSAGE);
        }
        setProfile(result);
      })
      .catch(() => {
        if (cancelled) return;
        // A rejection is a failed read, not proof of absence.
        setIsNotFound(false);
        setErrorMessage(LOAD_FAILED_MESSAGE);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, attempt]);

  return { profile, isLoading, errorMessage, isNotFound, retry };
}
