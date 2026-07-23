import { useEffect, useRef, useState } from "react";
import { Alert } from "react-native";

import { getMyLikeState, LikeTargetType, toggleLike } from "../services/likeService";

interface UseLikeOptions {
  targetType: LikeTargetType;
  targetId: string;
  initialLikeCount: number;
  uid: string | undefined;
}

export function useLike({ targetType, targetId, initialLikeCount, uid }: UseLikeOptions) {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [isToggling, setIsToggling] = useState(false);
  // Guards the initial getMyLikeState resolution against a stale response
  // clobbering state after targetId/uid has already changed (e.g. fast
  // feed scroll reusing a card).
  const requestIdRef = useRef(0);

  useEffect(() => {
    setLikeCount(initialLikeCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId]);

  useEffect(() => {
    if (!uid) {
      setLiked(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    getMyLikeState(targetType, targetId, uid)
      .then((state) => {
        if (requestId !== requestIdRef.current) return;
        setLiked(state);
      })
      .catch(() => {
        // Non-fatal — the like button just falls back to its default
        // "not liked" state; toggling still works independently.
      });
  }, [targetType, targetId, uid]);

  async function toggle() {
    // Prevents rapid duplicate taps from firing overlapping toggles —
    // each one would otherwise flip the optimistic state again before the
    // previous request resolves.
    if (!uid || isToggling) return;

    const previousLiked = liked;
    const previousCount = likeCount;

    setLiked(!previousLiked);
    setLikeCount(Math.max(0, previousCount + (previousLiked ? -1 : 1)));
    setIsToggling(true);

    try {
      const result = await toggleLike(targetType, targetId);
      setLiked(result.liked);
      setLikeCount(result.likeCount);
    } catch {
      // Rollback to the pre-optimistic values on failure.
      setLiked(previousLiked);
      setLikeCount(previousCount);
      Alert.alert("Beğeni işlemi tamamlanamadı.", "Lütfen tekrar deneyin.");
    } finally {
      setIsToggling(false);
    }
  }

  return { liked, likeCount, isToggling, toggle };
}
