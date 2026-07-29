import { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  cancelFriendRequest as cancelFriendRequestCallable,
  removeFriend as removeFriendCallable,
  respondToFriendRequest as respondToFriendRequestCallable,
} from "@services/firebase/functions";
import {
  FriendshipPage,
  getFriendsPage,
  getIncomingRequestsPage,
  getOutgoingRequestsPage,
} from "@services/firebase/friendships";
import { Friendship } from "@/types/friendship";

import { mapFriendErrorToMessage } from "../services/friendErrorMapper";
import { dedupeFriendshipsById, mergeFriendshipPages } from "../services/friendshipListMerge";

const PAGE_SIZE = 20;

type SectionKey = "friends" | "incoming" | "outgoing";
type PageLoader = (
  uid: string,
  pageSize: number,
  cursor: QueryDocumentSnapshot<DocumentData> | null,
) => Promise<FriendshipPage>;

const LOADERS: Record<SectionKey, PageLoader> = {
  friends: getFriendsPage,
  incoming: getIncomingRequestsPage,
  outgoing: getOutgoingRequestsPage,
};

interface SectionState {
  items: Friendship[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  errorMessage: string | null;
  cursor: QueryDocumentSnapshot<DocumentData> | null;
}

const INITIAL_SECTION: SectionState = {
  items: [],
  isLoading: true,
  isLoadingMore: false,
  hasMore: false,
  errorMessage: null,
  cursor: null,
};

// Backs the shared FriendsScreen's three segments (Arkadaşlar / Gelen
// İstekler / Gönderilen İstekler) — used identically by both the teacher
// and student route wrappers. Each section paginates independently;
// mutations (accept/decline/cancel/remove) optimistically remove the
// affected row and roll it back on failure (spec section 10's "başarısız
// mutation'da eski state geri gelmeli").
export function useFriendsScreen(uid: string | undefined) {
  const [sections, setSections] = useState<Record<SectionKey, SectionState>>({
    friends: { ...INITIAL_SECTION },
    incoming: { ...INITIAL_SECTION },
    outgoing: { ...INITIAL_SECTION },
  });
  const [actioningId, setActioningId] = useState<string | null>(null);
  // Rapid double-tap guard — same synchronous-ref pattern as
  // useTeacherClasses' isCreatingRef, extended to per-row actions via id.
  const actioningRef = useRef<Set<string>>(new Set());

  const loadSection = useCallback(
    async (key: SectionKey, mode: "initial" | "more") => {
      if (!uid) return;
      setSections((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          isLoading: mode === "initial" ? true : prev[key].isLoading,
          isLoadingMore: mode === "more",
          errorMessage: null,
        },
      }));
      try {
        const cursor = mode === "more" ? sections[key].cursor : null;
        const page = await LOADERS[key](uid, PAGE_SIZE, cursor);
        setSections((prev) => ({
          ...prev,
          [key]: {
            items: dedupeFriendshipsById(
              mode === "more" ? mergeFriendshipPages(prev[key].items, page.items) : page.items,
            ),
            isLoading: false,
            isLoadingMore: false,
            hasMore: page.hasMore,
            errorMessage: null,
            cursor: page.cursor,
          },
        }));
      } catch {
        setSections((prev) => ({
          ...prev,
          [key]: {
            ...prev[key],
            isLoading: false,
            isLoadingMore: false,
            errorMessage: "Yüklenemedi. Lütfen tekrar deneyin.",
          },
        }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [uid],
  );

  useEffect(() => {
    if (!uid) return;
    loadSection("friends", "initial");
    loadSection("incoming", "initial");
    loadSection("outgoing", "initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  function loadMore(key: SectionKey) {
    if (sections[key].hasMore && !sections[key].isLoadingMore) {
      loadSection(key, "more");
    }
  }

  function retry(key: SectionKey) {
    loadSection(key, "initial");
  }

  function removeFromSection(key: SectionKey, friendship: Friendship) {
    setSections((prev) => ({
      ...prev,
      [key]: { ...prev[key], items: prev[key].items.filter((f) => f.id !== friendship.id) },
    }));
  }

  function restoreToSection(key: SectionKey, friendship: Friendship) {
    setSections((prev) => ({
      ...prev,
      [key]: { ...prev[key], items: dedupeFriendshipsById([friendship, ...prev[key].items]) },
    }));
  }

  async function withRowGuard(
    friendshipId: string,
    action: () => Promise<void>,
  ): Promise<string | null> {
    if (actioningRef.current.has(friendshipId)) return null;
    actioningRef.current.add(friendshipId);
    setActioningId(friendshipId);
    try {
      await action();
      return null;
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code: unknown }).code)
          : undefined;
      return mapFriendErrorToMessage(code);
    } finally {
      actioningRef.current.delete(friendshipId);
      setActioningId(null);
    }
  }

  async function acceptIncoming(friendship: Friendship, otherUid: string): Promise<string | null> {
    removeFromSection("incoming", friendship);
    const error = await withRowGuard(friendship.id, async () => {
      await respondToFriendRequestCallable(otherUid, "accept");
    });
    if (error) restoreToSection("incoming", friendship);
    else loadSection("friends", "initial");
    return error;
  }

  async function declineIncoming(friendship: Friendship, otherUid: string): Promise<string | null> {
    removeFromSection("incoming", friendship);
    const error = await withRowGuard(friendship.id, async () => {
      await respondToFriendRequestCallable(otherUid, "decline");
    });
    if (error) restoreToSection("incoming", friendship);
    return error;
  }

  async function cancelOutgoing(friendship: Friendship, otherUid: string): Promise<string | null> {
    removeFromSection("outgoing", friendship);
    const error = await withRowGuard(friendship.id, async () => {
      await cancelFriendRequestCallable(otherUid);
    });
    if (error) restoreToSection("outgoing", friendship);
    return error;
  }

  async function removeExistingFriend(
    friendship: Friendship,
    otherUid: string,
  ): Promise<string | null> {
    removeFromSection("friends", friendship);
    const error = await withRowGuard(friendship.id, async () => {
      await removeFriendCallable(otherUid);
    });
    if (error) restoreToSection("friends", friendship);
    return error;
  }

  return {
    friends: sections.friends,
    incoming: sections.incoming,
    outgoing: sections.outgoing,
    actioningId,
    loadMore,
    retry,
    acceptIncoming,
    declineIncoming,
    cancelOutgoing,
    removeExistingFriend,
  };
}
