import { useEffect, useState } from "react";

import { subscribeToOwnSocialMeta } from "@services/firebase/friendships";
import { EMPTY_SOCIAL_META, SocialMetaSummary } from "@/types/friendship";

// The one small realtime window this phase uses (spec section 11) — a
// live listener on the caller's own socialMeta/summary doc, so the
// friend/incoming/outgoing counts shown on Profile and inside FriendsScreen
// update immediately after a mutation, without polling or a general
// notification system.
export function useSocialMeta(uid: string | undefined): SocialMetaSummary {
  const [summary, setSummary] = useState<SocialMetaSummary>(EMPTY_SOCIAL_META);

  useEffect(() => {
    if (!uid) {
      setSummary(EMPTY_SOCIAL_META);
      return;
    }
    const unsubscribe = subscribeToOwnSocialMeta(uid, setSummary);
    return unsubscribe;
  }, [uid]);

  return summary;
}
