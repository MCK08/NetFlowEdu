import { useEffect, useState } from "react";

import { CommunitySignal } from "../services/communityBand";
import { getCommunitySignal } from "../services/communityDifficultyService";

// Phase 108 — one question's anonymous signal, for the question screen.
// One document read per question opened; never a listener, never a scan.
export function useCommunitySignal(questionId: string | undefined) {
  const [signal, setSignal] = useState<CommunitySignal | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSignal(null);
    if (!questionId) return;
    getCommunitySignal(questionId)
      .then((next) => {
        if (!cancelled) setSignal(next);
      })
      .catch(() => {
        // A failed read shows nothing rather than an error: the signal is a
        // quiet aside on the question, never something the screen depends on.
        if (!cancelled) setSignal(null);
      });
    return () => {
      cancelled = true;
    };
  }, [questionId]);

  return signal;
}
