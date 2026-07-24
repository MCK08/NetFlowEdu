import { useEffect, useState } from "react";

import { getCachedProfile, getPublicIdentity } from "../services/profileCacheService";

interface ProfileIdentity {
  primaryName: string;
  usernameHandle: string | null;
  photoURL: string | null;
  isLoading: boolean;
}

const INITIAL: ProfileIdentity = {
  primaryName: "Kullanıcı",
  usernameHandle: null,
  photoURL: null,
  isLoading: true,
};

// Resolves a uid to a public identity (displayName primary, @username
// secondary — see resolvePublicIdentity) and avatar, via the shared
// profile cache. Safe against unmount/uid-change races: a stale in-flight
// fetch can never clobber state after the hook has moved on to a different
// uid.
export function useProfileHandle(uid: string | undefined): ProfileIdentity {
  const [state, setState] = useState<ProfileIdentity>(INITIAL);

  useEffect(() => {
    if (!uid) {
      setState(INITIAL);
      return;
    }

    let cancelled = false;
    setState((prev) => ({ ...prev, isLoading: true }));

    getCachedProfile(uid).then((profile) => {
      if (cancelled) return;
      const identity = getPublicIdentity(profile);
      setState({
        primaryName: identity.primaryName,
        usernameHandle: identity.usernameHandle,
        photoURL: profile?.photoURL ?? null,
        isLoading: false,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [uid]);

  return state;
}
