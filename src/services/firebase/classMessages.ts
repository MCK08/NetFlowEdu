import {
  collection,
  doc,
  DocumentData,
  DocumentSnapshot,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  QueryDocumentSnapshot,
  runTransaction,
  serverTimestamp,
  startAfter,
  Timestamp,
  Unsubscribe,
} from "firebase/firestore";

import { db } from "./config";
import { ChatSenderRole, ClassMessage } from "@/types/message";

// Bounded live window AND page size for lazy-loaded history — see
// subscribeToRecentClassMessages/getOlderClassMessagesPage.
export const CHAT_PAGE_SIZE = 30;

export interface SendClassMessageInput {
  classId: string;
  senderId: string;
  senderName: string;
  senderPhoto: string | null;
  senderRole: ChatSenderRole;
  text: string;
  clientMessageId: string;
}

function toClassMessage(id: string, data: DocumentData): ClassMessage {
  return {
    id,
    clientMessageId: data.clientMessageId ?? "",
    classId: data.classId ?? "",
    senderId: data.senderId ?? "",
    senderName: data.senderName ?? "",
    senderPhoto: data.senderPhoto ?? null,
    senderRole: data.senderRole === "teacher" ? "teacher" : "student",
    text: data.text ?? "",
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : 0,
    editedAt: data.editedAt instanceof Timestamp ? data.editedAt.toMillis() : null,
    deleted: data.deleted === true,
  };
}

// Sends a message AND records the sender's own send timestamp in the SAME
// atomic transaction — this is what firestore.rules'
// isWithinClassMessageRateLimit reads to enforce a real, server-side 1
// message/second limit (see classes/{classId}/messageRateLimits/{uid} in
// firestore.rules): a modified client can't skip writing it, because the
// message create rule itself requires this write to be consistent with it.
// Client-side cooldown UX (instant feedback with no round-trip) lives in
// useClassChat — this function only performs the write; the rules are the
// actual authority.
export async function sendClassMessage(input: SendClassMessageInput): Promise<void> {
  const messageRef = doc(collection(db, "classes", input.classId, "messages"));
  const rateLimitRef = doc(db, "classes", input.classId, "messageRateLimits", input.senderId);

  await runTransaction(db, async (tx) => {
    tx.set(messageRef, {
      classId: input.classId,
      senderId: input.senderId,
      senderName: input.senderName,
      senderPhoto: input.senderPhoto,
      senderRole: input.senderRole,
      clientMessageId: input.clientMessageId,
      text: input.text,
      createdAt: serverTimestamp(),
      editedAt: null,
      deleted: false,
    });
    tx.set(rateLimitRef, { lastMessageAt: serverTimestamp() });
  });
}

// Real-time window of the most recent CHAT_PAGE_SIZE messages, ascending
// (oldest of the window first) — only this window is "live"; older history
// is loaded on demand via getOlderClassMessagesPage (one-time reads). This
// is the standard "bounded live tail + lazy history" chat pattern: holding
// a listener open on a whole, ever-growing message history forever would
// keep downloading and re-evaluating documents the user may never scroll
// back to.
//
// Also hands back the raw descending QueryDocumentSnapshot[] so the caller
// can derive an initial pagination cursor (the oldest doc currently in the
// live window) without an extra read.
export function subscribeToRecentClassMessages(
  classId: string,
  onChange: (messages: ClassMessage[], rawDocsDesc: QueryDocumentSnapshot<DocumentData>[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, "classes", classId, "messages"),
    orderBy("createdAt", "desc"),
    limit(CHAT_PAGE_SIZE),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const ascending = snapshot.docs
        .map((docSnap) => toClassMessage(docSnap.id, docSnap.data()))
        .reverse();
      onChange(ascending, snapshot.docs);
    },
    onError,
  );
}

export interface OlderMessagesPage {
  messages: ClassMessage[]; // ascending
  cursor: DocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

// One-time fetch of the page of messages strictly older than `cursor`. No
// `where` clause — single-field orderBy on a classId-scoped subcollection
// path, so (like getSavedQuestionsPage/getClassQuestionsPage) this needs no
// composite index no matter how many pages are fetched.
export async function getOlderClassMessagesPage(
  classId: string,
  cursor: DocumentSnapshot<DocumentData>,
): Promise<OlderMessagesPage> {
  const q = query(
    collection(db, "classes", classId, "messages"),
    orderBy("createdAt", "desc"),
    startAfter(cursor),
    limit(CHAT_PAGE_SIZE),
  );
  const snapshot = await getDocs(q);
  const messages = snapshot.docs.map((docSnap) => toClassMessage(docSnap.id, docSnap.data())).reverse();
  const lastDoc = snapshot.docs[snapshot.docs.length - 1];
  return {
    messages,
    cursor: lastDoc ?? null,
    hasMore: snapshot.docs.length === CHAT_PAGE_SIZE,
  };
}
