import { useEffect, useState } from "react";

import { getCachedProfile, getDisplayHandle } from "../services/profileCacheService";

interface ProfileHandle {
  handle: string;
  photoURL: string | null;
  isLoading: boolean;
}

const INITIAL: ProfileHandle = { handle: "Kullanıcı", photoURL: null, isLoading: true };

// Resolves a uid to a display handle (username -> displayName ->
// "Kullanıcı", never uid) and avatar, via the shared profile cache. Safe
// against unmount/uid-change races: a stale in-flight fetch can never
// clobber state after the hook has moved on to a different uid.
export function useProfileHandle(uid: string | undefined): ProfileHandle {
  const [state, setState] = useState<ProfileHandle>(INITIAL);

  useEffect(() => {
    if (!uid) {
      setState(INITIAL);
      return;
    }

    let cancelled = false;
    setState((prev) => ({ ...prev, isLoading: true }));

    getCachedProfile(uid).then((profile) => {
      if (cancelled) return;
      setState({
        handle: getDisplayHandle(profile),
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
