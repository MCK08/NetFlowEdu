import { useEffect, useState } from "react";

import { subscribeToOwnSocialMeta } from "@services/firebase/friendships";
import { EMPTY_SOCIAL_META, SocialMetaSummary } from "@/types/friendship";

// The one small realtime window this phase uses (spec section 11) — a
// live listener on the caller's own socialMeta/summary doc, so the
// friend/incoming/outgoing counts shown on Profile and inside FriendsScreen
// update immediately after a mutation, without polling or a general
// notification system.
//
// Phase 103 — whether the listener has answered is tracked explicitly.
// Profile used to treat `updatedAt === 0` as "still loading", but a user
// with no friendship activity has no summary document at all, so their
// summary is legitimately all-zero with updatedAt 0 forever — every new
// account saw permanent loading placeholders. A missing document is an
// answer ("0 friends"); only a listener that has not answered yet is
// loading, and one that failed is unavailable rather than a confident 0.
export type SocialMetaStatus = "loading" | "ready" | "error";

export interface SocialMetaView extends SocialMetaSummary {
  status: SocialMetaStatus;
}

interface SocialMetaState {
  uid: string | undefined;
  summary: SocialMetaSummary;
  status: SocialMetaStatus;
}

export function useSocialMeta(uid: string | undefined): SocialMetaView {
  const [state, setState] = useState<SocialMetaState>({
    uid,
    summary: EMPTY_SOCIAL_META,
    status: uid ? "loading" : "ready",
  });

  useEffect(() => {
    if (!uid) {
      setState({ uid, summary: EMPTY_SOCIAL_META, status: "ready" });
      return;
    }
    // A different account starts from "loading", never from the previous
    // account's counts or its "ready".
    setState({ uid, summary: EMPTY_SOCIAL_META, status: "loading" });
    const unsubscribe = subscribeToOwnSocialMeta(
      uid,
      (summary) => setState({ uid, summary, status: "ready" }),
      () => setState({ uid, summary: EMPTY_SOCIAL_META, status: "error" }),
    );
    return unsubscribe;
  }, [uid]);

  // Between an account switch and the effect above running, the stored state
  // still belongs to the previous uid: report it as loading, not as theirs.
  if (state.uid !== uid) return { ...EMPTY_SOCIAL_META, status: uid ? "loading" : "ready" };
  return { ...state.summary, status: state.status };
}
