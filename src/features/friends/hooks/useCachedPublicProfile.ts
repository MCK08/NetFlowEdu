import { useEffect, useState } from "react";

import { getCachedProfile } from "@features/profiles";
import { PublicProfile } from "@/types/publicProfile";

// Thin wrapper around the shared profile cache (getCachedProfile) that
// exposes the FULL PublicProfile, not just the name/photo useProfileHandle
// extracts — friend rows also need `role` for the Öğretmen/Öğrenci badge.
// Reuses the exact same module-level cache/dedup, never a second fetch path.
export function useCachedPublicProfile(uid: string | undefined): PublicProfile | null {
  const [profile, setProfile] = useState<PublicProfile | null>(null);

  useEffect(() => {
    if (!uid) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    getCachedProfile(uid).then((result) => {
      if (!cancelled) setProfile(result);
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return profile;
}
