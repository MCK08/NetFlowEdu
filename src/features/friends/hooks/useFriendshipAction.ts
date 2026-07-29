import { useEffect, useRef, useState } from "react";

import { runGuardedOnce } from "@features/authentication/services/guardedAction";
import { getFriendshipBetween } from "@services/firebase/friendships";
import {
  cancelFriendRequest,
  removeFriend,
  respondToFriendRequest,
  sendFriendRequest,
} from "@services/firebase/functions";
import { Friendship } from "@/types/friendship";

import { mapFriendErrorToMessage } from "../services/friendErrorMapper";
import { FriendshipButtonState, resolveFriendshipButtonState } from "../services/friendshipState";

interface UseFriendshipActionResult {
  state: FriendshipButtonState;
  isLoading: boolean;
  isMutating: boolean;
  errorMessage: string | null;
  sendRequest: () => Promise<void>;
  cancelRequest: () => Promise<void>;
  acceptRequest: () => Promise<void>;
  declineRequest: () => Promise<void>;
  unfriend: () => Promise<void>;
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

// Backs PublicProfileScreen's single friendship status button. Reuses
// runGuardedOnce (the same rapid-double-tap primitive as
// useEmailVerification's resend/signOut) so two taps landing before the
// first callable resolves can never fire two mutations or push two
// dialogs. On failure, `friendship` is left exactly as it was before the
// call — a real, mapped error message is surfaced instead of a silent or
// misleading state change.
export function useFriendshipAction(
  ownUid: string | undefined,
  otherUid: string | undefined,
): UseFriendshipActionResult {
  const [friendship, setFriendship] = useState<Friendship | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const guardRef = useRef(false);

  useEffect(() => {
    if (!ownUid || !otherUid || ownUid === otherUid) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    getFriendshipBetween(ownUid, otherUid)
      .then((result) => {
        if (!cancelled) setFriendship(result);
      })
      .catch(() => {
        if (!cancelled) setFriendship(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ownUid, otherUid]);

  async function mutate(action: () => Promise<void>): Promise<void> {
    if (!ownUid || !otherUid) return;
    setErrorMessage(null);
    await runGuardedOnce(guardRef, async () => {
      setIsMutating(true);
      try {
        await action();
        const fresh = await getFriendshipBetween(ownUid, otherUid);
        setFriendship(fresh);
      } catch (error) {
        setErrorMessage(mapFriendErrorToMessage(errorCode(error)));
      } finally {
        setIsMutating(false);
      }
    });
  }

  return {
    state: resolveFriendshipButtonState(friendship, ownUid ?? ""),
    isLoading,
    isMutating,
    errorMessage,
    sendRequest: () => mutate(() => sendFriendRequest(otherUid as string).then(() => undefined)),
    cancelRequest: () => mutate(() => cancelFriendRequest(otherUid as string).then(() => undefined)),
    acceptRequest: () =>
      mutate(() => respondToFriendRequest(otherUid as string, "accept").then(() => undefined)),
    declineRequest: () =>
      mutate(() => respondToFriendRequest(otherUid as string, "decline").then(() => undefined)),
    unfriend: () => mutate(() => removeFriend(otherUid as string).then(() => undefined)),
  };
}
