import { FirebaseError } from "firebase/app";
import { DocumentData, DocumentSnapshot, QueryDocumentSnapshot } from "firebase/firestore";
import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard } from "react-native";

import { runGuardedOnce } from "@features/authentication/services/guardedAction";
import {
  getOlderClassMessagesPage,
  sendClassMessage,
  subscribeToRecentClassMessages,
} from "@services/firebase/classMessages";
import { ChatListMessage, ChatSenderRole, ClassMessage } from "@/types/message";

import { mergeClassMessages } from "../services/classMessageMerge";
import { normalizeMessageText, validateMessageText } from "../services/messageValidation";

const PERMISSION_DENIED_MESSAGE = "Bu sınıfın sohbetini görüntüleme yetkiniz yok.";
const GENERIC_ERROR_MESSAGE = "Mesajlar yüklenirken bir hata oluştu.";
const OFFLINE_MESSAGE = "Bağlantı sorunu. Mesaj gönderilemedi.";
const SEND_FAILED_MESSAGE = "Mesaj gönderilemedi. Lütfen tekrar deneyin.";
const RATE_LIMIT_MESSAGE = "Çok hızlı gönderiyorsunuz. Lütfen bir saniye bekleyin.";

// Mirrors firestore.rules' isWithinClassMessageRateLimit exactly (1 second)
// — this is only a fast, no-round-trip UX hint; the server-side rule
// (checked against classes/{classId}/messageRateLimits/{uid}, written
// atomically with every send) is what actually enforces it, immune to
// client clock skew or a modified client skipping this check entirely.
const RATE_LIMIT_MS = 1000;

export interface ChatSender {
  uid: string;
  displayName: string;
  photoURL: string | null;
  role: ChatSenderRole;
}

interface UseClassChatOptions {
  classId: string | undefined;
  sender: ChatSender | null;
}

function errorCodeOf(error: unknown): string {
  if (error instanceof FirebaseError) return error.code;
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "unknown";
}

function generateClientMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Real-time class chat with optimistic UI and lazy-loaded history.
//
// Two message sources are merged (see mergeClassMessages): a bounded live
// window (subscribeToRecentClassMessages, the most recent CHAT_PAGE_SIZE
// messages) and manually-paginated older history (getOlderClassMessagesPage,
// one-time reads triggered by loadOlderMessages). Optimistic ("pending")
// messages are tracked separately, keyed by a client-generated
// clientMessageId, and are automatically removed once the real,
// server-confirmed document (carrying the same clientMessageId) arrives via
// the live listener — see the reconciliation effect below.
export function useClassChat({ classId, sender }: UseClassChatOptions) {
  const [liveMessages, setLiveMessages] = useState<ClassMessage[]>([]);
  const [olderMessages, setOlderMessages] = useState<ClassMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);

  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [pendingById, setPendingById] = useState<Record<string, ChatListMessage>>({});

  const sendingRef = useRef(false);
  const lastSentAtRef = useRef(0);
  // The oldest doc currently known, used as the startAfter cursor for the
  // NEXT loadOlderMessages call. Seeded lazily from the live listener's own
  // raw docs the first time pagination is requested (before that, there is
  // no need for a cursor at all), then advanced after every successful page.
  const liveRawDocsRef = useRef<QueryDocumentSnapshot<DocumentData>[]>([]);
  const olderCursorRef = useRef<DocumentSnapshot<DocumentData> | null>(null);

  useEffect(() => {
    if (!classId) {
      setLiveMessages([]);
      setOlderMessages([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setOlderMessages([]);
    setHasMoreOlder(true);
    olderCursorRef.current = null;

    const unsubscribe = subscribeToRecentClassMessages(
      classId,
      (next, rawDocsDesc) => {
        liveRawDocsRef.current = rawDocsDesc;
        setLiveMessages(next);
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        setIsLoading(false);
        const code = errorCodeOf(err);
        setError(code === "permission-denied" ? PERMISSION_DENIED_MESSAGE : GENERIC_ERROR_MESSAGE);
      },
    );

    return unsubscribe;
  }, [classId]);

  const messages = mergeClassMessages(olderMessages, liveMessages);

  // Reconciliation: once a real, server-confirmed message with a given
  // clientMessageId shows up in `messages`, the matching optimistic entry
  // is no longer needed — remove it so the bubble isn't rendered twice.
  useEffect(() => {
    setPendingById((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const confirmedIds = new Set(messages.map((m) => m.clientMessageId));
      let changed = false;
      const next: Record<string, ChatListMessage> = {};
      for (const [clientMessageId, pending] of Object.entries(prev)) {
        if (confirmedIds.has(clientMessageId)) {
          changed = true;
          continue;
        }
        next[clientMessageId] = pending;
      }
      return changed ? next : prev;
    });
  }, [messages]);

  const listMessages: ChatListMessage[] = [...messages, ...Object.values(pendingById)].sort(
    (a, b) => a.createdAt - b.createdAt,
  );

  const loadOlderMessages = useCallback(async () => {
    if (!classId || isLoadingOlder || !hasMoreOlder) return;

    if (!olderCursorRef.current) {
      const oldestLiveDoc = liveRawDocsRef.current[liveRawDocsRef.current.length - 1];
      if (!oldestLiveDoc) return; // nothing loaded yet to paginate from
      olderCursorRef.current = oldestLiveDoc;
    }

    setIsLoadingOlder(true);
    try {
      const page = await getOlderClassMessagesPage(classId, olderCursorRef.current);
      setOlderMessages((prev) => mergeClassMessages(prev, page.messages));
      olderCursorRef.current = page.cursor;
      setHasMoreOlder(page.hasMore);
    } catch {
      // Pagination failure never blanks messages already on screen — it
      // only stops further auto-fetching for this session.
      setHasMoreOlder(false);
    } finally {
      setIsLoadingOlder(false);
    }
  }, [classId, isLoadingOlder, hasMoreOlder]);

  async function send(): Promise<void> {
    if (!classId || !sender) return;

    const validationError = validateMessageText(draft);
    if (validationError) {
      setSendError(validationError);
      return;
    }

    if (Date.now() - lastSentAtRef.current < RATE_LIMIT_MS) {
      setSendError(RATE_LIMIT_MESSAGE);
      return;
    }

    await runGuardedOnce(sendingRef, async () => {
      setSendError(null);
      const clientMessageId = generateClientMessageId();
      const text = normalizeMessageText(draft);
      const optimistic: ChatListMessage = {
        id: `local-${clientMessageId}`,
        clientMessageId,
        classId,
        senderId: sender.uid,
        senderName: sender.displayName,
        senderPhoto: sender.photoURL,
        senderRole: sender.role,
        text,
        createdAt: Date.now(),
        editedAt: null,
        deleted: false,
        status: "pending",
      };

      setPendingById((prev) => ({ ...prev, [clientMessageId]: optimistic }));
      setDraft("");
      Keyboard.dismiss();
      setIsSending(true);
      try {
        await sendClassMessage({
          classId,
          senderId: sender.uid,
          senderName: sender.displayName,
          senderPhoto: sender.photoURL,
          senderRole: sender.role,
          text,
          clientMessageId,
        });
        lastSentAtRef.current = Date.now();
        // Reconciliation happens via the effect above once the live
        // listener delivers the confirmed document — not removed here, so
        // the bubble never has a flash of disappearing before the
        // real one has rendered.
      } catch (err) {
        const code = errorCodeOf(err);
        setPendingById((prev) => ({
          ...prev,
          [clientMessageId]: { ...optimistic, status: "failed" },
        }));
        setSendError(code === "unavailable" ? OFFLINE_MESSAGE : SEND_FAILED_MESSAGE);
      } finally {
        setIsSending(false);
      }
    });
  }

  // Re-attempts sending a message that previously failed, reusing the same
  // clientMessageId (idempotent from the reconciliation's point of view —
  // if the original write actually did land despite the client seeing an
  // error, the retry becomes a second, separate message rather than
  // silently vanishing, which is the safer failure mode for a chat).
  async function retryFailed(clientMessageId: string): Promise<void> {
    if (!classId || !sender) return;
    const pending = pendingById[clientMessageId];
    if (!pending || pending.status !== "failed") return;

    setPendingById((prev) => ({ ...prev, [clientMessageId]: { ...pending, status: "pending" } }));
    try {
      await sendClassMessage({
        classId,
        senderId: sender.uid,
        senderName: sender.displayName,
        senderPhoto: sender.photoURL,
        senderRole: sender.role,
        text: pending.text,
        clientMessageId,
      });
      lastSentAtRef.current = Date.now();
    } catch (err) {
      const code = errorCodeOf(err);
      setPendingById((prev) => ({ ...prev, [clientMessageId]: { ...pending, status: "failed" } }));
      setSendError(code === "unavailable" ? OFFLINE_MESSAGE : SEND_FAILED_MESSAGE);
    }
  }

  return {
    messages: listMessages,
    isLoading,
    error,
    hasMoreOlder,
    isLoadingOlder,
    loadOlderMessages,
    draft,
    setDraft,
    isSending,
    sendError,
    send,
    retryFailed,
  };
}
