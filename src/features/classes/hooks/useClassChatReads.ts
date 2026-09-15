import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import {
  ChatReadCursor,
  ChatReadTarget,
  markClassChatRead,
  subscribeToClassChatReads,
} from "@services/firebase/classChatReads";

import { shouldMarkRead } from "../services/chatReadReceipts";

interface UseClassChatReadsOptions {
  classId: string | undefined;
  uid: string | undefined;
  /** The newest confirmed message in the live window, with its raw timestamp. */
  newest: ChatReadTarget | null;
}

// Phase 102 — read cursors for one class chat.
//
// WHEN A MESSAGE COUNTS AS SEEN
//
// Only while the conversation is actually in front of the member: this
// route is focused (nothing pushed over it) AND the app is in the
// foreground. Fetching messages, a listener delivering one in the
// background, or a notification arriving never marks anything — the cursor
// moves only when a person could have read the screen. Both signals are
// re-checked on change, so returning to a chat left open picks up what
// arrived meanwhile.
//
// WHAT IT COSTS
//
// One listener on the class's chatReads collection (bounded by member
// count), open only while the conversation is on screen; and one write per
// "the newest message changed while I was looking" — never one per fetch,
// never one per re-render, and nothing at all when the member's own cursor
// already covers the newest message (shouldMarkRead).
export function useClassChatReads({ classId, uid, newest }: UseClassChatReadsOptions) {
  const [cursors, setCursors] = useState<ChatReadCursor[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isForeground, setIsForeground] = useState(AppState.currentState === "active");
  const inFlightRef = useRef<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, []),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setIsForeground(state === "active");
    });
    return () => subscription.remove();
  }, []);

  const isOpen = isFocused && isForeground;

  useEffect(() => {
    if (!classId || !isOpen) {
      setHasLoaded(false);
      return;
    }
    const unsubscribe = subscribeToClassChatReads(
      classId,
      (next) => {
        setCursors(next);
        setHasLoaded(true);
      },
      () => {
        // A receipt that cannot be read is not an error the person needs
        // to act on; the conversation itself is unaffected.
      },
    );
    return unsubscribe;
  }, [classId, isOpen]);

  useEffect(() => {
    if (!classId || !uid || !isOpen || !hasLoaded || !newest) return;
    const own = cursors.find((cursor) => cursor.uid === uid) ?? null;
    if (!shouldMarkRead(own, { id: newest.messageId, createdAt: newest.createdAt.toMillis() })) return;
    if (inFlightRef.current === newest.messageId) return;

    inFlightRef.current = newest.messageId;
    markClassChatRead(classId, uid, newest)
      .catch(() => {
        // Same as above: a failed receipt is retried the next time the
        // newest message changes, and never surfaces as a chat error.
      })
      .finally(() => {
        if (inFlightRef.current === newest.messageId) inFlightRef.current = null;
      });
  }, [classId, uid, isOpen, hasLoaded, newest, cursors]);

  return { cursors };
}
