import { ChatListMessage } from "@/types/message";

// Phase 102 — the pure half of "Görüldü".
//
// A class chat is a group, so a message has no single "seen" moment: each
// recipient keeps their own cursor (classes/{classId}/chatReads/{uid}, the
// newest message they have opened the conversation on), and the sender's
// label is derived from those cursors here. Nothing in this file talks to
// Firestore, which is what lets every rule below be pinned by a unit test.

export interface ReadCursorLike {
  uid: string;
  lastReadMessageId: string;
  lastReadAt: number;
}

export const SEEN_LABEL = "Görüldü";

/** The sender's newest confirmed, not-removed message — the ONE bubble that
 *  carries the seen label. Older messages never show it: once the newest is
 *  seen, everything before it is too, and repeating the word down the
 *  conversation would be noise. */
export function latestOwnMessage(
  messages: readonly ChatListMessage[],
  ownUid: string | undefined,
): ChatListMessage | null {
  if (!ownUid) return null;
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (!message) continue;
    if (message.senderId !== ownUid) continue;
    if (message.status || message.deleted || !message.createdAt) continue;
    return message;
  }
  return null;
}

/** How many OTHER members have opened the conversation at or after this
 *  message. A cursor counts when it points at the message itself or at any
 *  later one — a member who has read past it has read it. The sender's own
 *  cursor never counts: you cannot be seen by yourself. */
export function seenCount(
  message: { id: string; senderId: string; createdAt: number },
  cursors: readonly ReadCursorLike[],
): number {
  let count = 0;
  for (const cursor of cursors) {
    if (cursor.uid === message.senderId) continue;
    if (cursor.lastReadMessageId === message.id || cursor.lastReadAt >= message.createdAt) count++;
  }
  return count;
}

/** "Görüldü" for one reader, "Görüldü · N" for several, nothing for none. */
export function seenLabel(count: number): string | null {
  if (count <= 0) return null;
  return count === 1 ? SEEN_LABEL : `${SEEN_LABEL} · ${count}`;
}

/** Whether opening the conversation on `newest` should write the cursor.
 *
 *  Idempotent and monotonic by construction: nothing is written when the
 *  member's own cursor already covers the newest message, so re-focusing an
 *  unchanged conversation costs no write, and the cursor can only advance. */
export function shouldMarkRead(
  own: ReadCursorLike | null | undefined,
  newest: { id: string; createdAt: number } | null,
): boolean {
  if (!newest || !newest.createdAt) return false;
  if (!own) return true;
  if (own.lastReadMessageId === newest.id) return false;
  return newest.createdAt > own.lastReadAt;
}
