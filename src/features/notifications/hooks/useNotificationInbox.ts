import { DocumentData, DocumentSnapshot } from "firebase/firestore";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  getNotificationsPage,
  markAllNotificationsRead as markAllNotificationsReadRemote,
  markNotificationRead as markNotificationReadRemote,
  subscribeToUnreadCount,
} from "@services/firebase/notifications";
import { NotificationRecord } from "@/types/notification";

import { mapNotificationErrorToMessage } from "../services/notificationErrorMapper";
import {
  applyMarkAllReadTransition,
  applyReadTransition,
  mergeNotificationPages,
  revertReadTransition,
  willTransitionToRead,
} from "../services/notificationMerge";

const PAGE_SIZE = 20;

export function useNotificationInbox(uid: string | undefined) {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [paginationError, setPaginationError] = useState<string | null>(null);
  // A failed mark-read / mark-all — surfaced as a transient message rather
  // than replacing the whole list with an error state, since the list
  // itself loaded fine and is still fully usable.
  const [actionError, setActionError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const cursorRef = useRef<DocumentSnapshot<DocumentData> | null>(null);
  // Bumped on every fresh load (mount/refresh) so a slow, now-stale getDocs
  // response from a PREVIOUS load can't overwrite the result of a newer
  // one that already resolved — the same stale-request guard shape used
  // elsewhere in this app for cursor-paginated lists.
  const requestIdRef = useRef(0);
  // The uid this hook is CURRENTLY rendering for. An in-flight mark-read
  // started under account A must never mutate account B's list or badge
  // after a switch — every async completion below re-checks this ref
  // against the uid captured when the call started. (Account switching is
  // an in-place swap on the shared Auth instance, so this hook is NOT
  // remounted on switch; the guard is what makes that safe.)
  const activeUidRef = useRef(uid);
  activeUidRef.current = uid;
  // Mirrors of the two pieces of state an optimistic action needs to be
  // able to restore. Kept as refs (updated during render, never inside a
  // state updater) so a rollback reads the CURRENT value without either a
  // stale closure or an impure updater that StrictMode would double-run.
  const notificationsRef = useRef<NotificationRecord[]>([]);
  notificationsRef.current = notifications;
  const unreadCountRef = useRef(0);
  unreadCountRef.current = unreadCount;

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      if (!uid) return;
      const requestId = ++requestIdRef.current;

      if (mode === "initial") setIsLoading(true);
      else setIsRefreshing(true);
      setLoadError(null);

      try {
        const page = await getNotificationsPage(uid, PAGE_SIZE, null);
        if (requestIdRef.current !== requestId) return; // superseded by a newer load
        setNotifications(page.notifications);
        cursorRef.current = page.cursor;
        setHasMore(page.hasMore);
      } catch (error) {
        if (requestIdRef.current !== requestId) return;
        setLoadError(mapNotificationErrorToMessage(error));
      } finally {
        if (requestIdRef.current === requestId) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [uid],
  );

  useEffect(() => {
    load("initial");
  }, [load]);

  useEffect(() => {
    if (!uid) {
      setUnreadCount(0);
      return;
    }
    return subscribeToUnreadCount(uid, setUnreadCount);
  }, [uid]);

  const refresh = useCallback(() => load("refresh"), [load]);

  const loadMore = useCallback(async () => {
    if (!uid || isLoadingMore || !hasMore || !cursorRef.current) return;
    setIsLoadingMore(true);
    setPaginationError(null);
    const requestId = requestIdRef.current;
    try {
      const page = await getNotificationsPage(uid, PAGE_SIZE, cursorRef.current);
      if (requestIdRef.current !== requestId) return;
      setNotifications((prev) => mergeNotificationPages(prev, page.notifications));
      cursorRef.current = page.cursor;
      setHasMore(page.hasMore);
    } catch (error) {
      if (requestIdRef.current !== requestId) return;
      setPaginationError(mapNotificationErrorToMessage(error));
    } finally {
      if (requestIdRef.current === requestId) setIsLoadingMore(false);
    }
  }, [uid, isLoadingMore, hasMore]);

  // Optimistic local update first (so a tap feels instant and is safe to
  // Optimistic: the row flips to read and the badge drops immediately, then
  // the real callable runs (see notifications.ts's markNotificationRead doc
  // comment for why this is a callable, not a direct Firestore write).
  //
  // The transition decision is computed PURELY, before any setState —
  // deliberately NOT by inspecting applyReadTransition's return identity
  // inside a state updater. A React state updater must be pure; triggering
  // setUnreadCount from inside one meant StrictMode's double-invocation
  // decremented the badge twice for a single tap. willTransitionToRead
  // answers the same question without that side effect.
  //
  // On failure everything is rolled back — the row returns to unread with
  // its original readAt and the badge is restored — so the UI never claims
  // a read that the server rejected, and the user can simply tap again.
  const markRead = useCallback(
    async (notificationId: string) => {
      const startedForUid = uid;
      if (!startedForUid) return;

      const readAt = Date.now();
      // Decided purely from the current state, BEFORE any setState — no
      // side effects inside a state updater.
      if (!willTransitionToRead(notificationsRef.current, notificationId)) return;
      const previousReadAt =
        notificationsRef.current.find((n) => n.id === notificationId)?.readAt ?? null;

      setNotifications((prev) => applyReadTransition(prev, notificationId, readAt));
      setUnreadCount((count) => Math.max(0, count - 1));

      try {
        await markNotificationReadRemote(notificationId);
      } catch (error) {
        // The account may have been switched while this was in flight —
        // rolling back would then corrupt the NEW account's state with the
        // old one's failure. Drop it silently in that case.
        if (activeUidRef.current !== startedForUid) return;
        setNotifications((prev) => revertReadTransition(prev, notificationId, previousReadAt));
        setUnreadCount((count) => count + 1);
        // Mapped Turkish copy only — a raw Firebase code never reaches the UI.
        setActionError(mapNotificationErrorToMessage(error));
      }
    },
    [uid],
  );

  // Same optimistic-then-rollback contract as markRead. The previous list
  // is captured before the optimistic write so a failure restores exactly
  // the prior read/unread state per row (not a blanket "everything
  // unread", which would be wrong for rows that were already read).
  const markAllRead = useCallback(async () => {
    const startedForUid = uid;
    if (!startedForUid) return;

    const readAt = Date.now();
    const previousNotifications = notificationsRef.current;
    const previousUnreadCount = unreadCountRef.current;

    setNotifications((prev) => applyMarkAllReadTransition(prev, readAt));
    setUnreadCount(0);

    try {
      await markAllNotificationsReadRemote();
    } catch (error) {
      if (activeUidRef.current !== startedForUid) return;
      setNotifications(previousNotifications);
      setUnreadCount(previousUnreadCount);
      setActionError(mapNotificationErrorToMessage(error));
    }
  }, [uid]);

  const clearActionError = useCallback(() => setActionError(null), []);

  return {
    notifications,
    unreadCount,
    isLoading,
    isRefreshing,
    isLoadingMore,
    loadError,
    paginationError,
    actionError,
    clearActionError,
    hasMore,
    refresh,
    loadMore,
    markRead,
    markAllRead,
  };
}
