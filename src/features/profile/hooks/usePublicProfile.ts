import { useEffect, useState } from "react";

import { getPublicProfileOnce } from "@services/firebase/publicProfile";
import { PublicProfile } from "@/types/publicProfile";

const NOT_FOUND_MESSAGE = "Bu profil görüntülenemiyor.";

interface PublicProfileState {
  profile: PublicProfile | null;
  isLoading: boolean;
  errorMessage: string | null;
}

// Distinct from useProfileHandle (the cache used on feed/answer cards) —
// this screen needs an explicit "not found / unavailable" state to show a
// real error, not a silent "Kullanıcı" fallback.
export function usePublicProfile(userId: string | undefined): PublicProfileState {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setIsLoading(false);
      setErrorMessage(NOT_FOUND_MESSAGE);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);

    getPublicProfileOnce(userId)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setErrorMessage(NOT_FOUND_MESSAGE);
        }
        setProfile(result);
      })
      .catch(() => {
        if (cancelled) return;
        setErrorMessage(NOT_FOUND_MESSAGE);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { profile, isLoading, errorMessage };
}
