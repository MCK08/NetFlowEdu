import {
  collection,
  doc,
  DocumentData,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
} from "firebase/firestore";

import { db } from "./config";

// Phase 102 — classes/{classId}/chatReads/{uid}: one read cursor per class
// member, the newest message they have opened the conversation on. See the
// matching block in firestore.rules for what the server accepts.
//
// This is a GROUP conversation, so "seen" is per recipient: the sender's
// "Görüldü" is computed on the client from every other member's cursor
// (chatReadReceipts.ts). There is deliberately no presence, typing or
// online state in this document — the rules refuse any field but these.

export interface ChatReadCursor {
  uid: string;
  lastReadMessageId: string;
  /** The read message's createdAt, in ms (same truncation as ClassMessage.createdAt). */
  lastReadAt: number;
}

/** The newest confirmed message, carrying its RAW server timestamp: the
 *  rules require lastReadAt to equal the message's stored createdAt exactly,
 *  and a millisecond round-trip through ClassMessage.createdAt would not. */
export interface ChatReadTarget {
  messageId: string;
  createdAt: Timestamp;
}

function toCursor(uid: string, data: DocumentData): ChatReadCursor {
  return {
    uid,
    lastReadMessageId: typeof data.lastReadMessageId === "string" ? data.lastReadMessageId : "",
    lastReadAt: data.lastReadAt instanceof Timestamp ? data.lastReadAt.toMillis() : 0,
  };
}

// One write, only ever forward: the hook that calls this decides (from the
// member's own cursor in the live snapshot) whether the newest message is
// already covered, so an unchanged conversation costs nothing.
export async function markClassChatRead(
  classId: string,
  uid: string,
  target: ChatReadTarget,
): Promise<void> {
  await setDoc(doc(db, "classes", classId, "chatReads", uid), {
    lastReadMessageId: target.messageId,
    lastReadAt: target.createdAt,
    updatedAt: serverTimestamp(),
  });
}

// Every member's cursor for one class — bounded by the class's member
// count, and held open only while the conversation is on screen (the hook
// subscribes under focus).
export function subscribeToClassChatReads(
  classId: string,
  onChange: (cursors: ChatReadCursor[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, "classes", classId, "chatReads"),
    (snapshot) => onChange(snapshot.docs.map((docSnap) => toCursor(docSnap.id, docSnap.data()))),
    onError,
  );
}
