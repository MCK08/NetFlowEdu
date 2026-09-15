import { Ionicons } from "@expo/vector-icons";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Keyboard, KeyboardAvoidingView, ListRenderItemInfo, NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@components/ui/EmptyState";
import { useAuth } from "@features/authentication";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { shadows } from "@theme/shadows";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";

import { ChatComposer } from "../components/ChatComposer";
import { ChatDateSeparator } from "../components/ChatDateSeparator";
import { ChatErrorBanner } from "../components/ChatErrorBanner";
import { ChatHeader } from "../components/ChatHeader";
import { ChatLoadingSkeleton } from "../components/ChatLoadingSkeleton";
import { ChatMessageBubble } from "../components/ChatMessageBubble";
import { RemoveMessageSheet } from "../components/RemoveMessageSheet";
import { ChatSender, useClassChat } from "../hooks/useClassChat";
import { useClassChatReads } from "../hooks/useClassChatReads";
import { latestOwnMessage, seenCount, seenLabel } from "../services/chatReadReceipts";
import {
  buildChatTimeline,
  chatTimelineSignature,
  ChatTimelineItem,
} from "../services/chatTimeline";
import { canRemoveMessage } from "../services/messageModeration";
import { ChatListMessage } from "@/types/message";

interface ClassChatScreenProps {
  classId: string;
}

// How close to the bottom (offset 0 on an inverted list) counts as
// "already at the bottom" for auto-scroll/new-message-indicator purposes.
const AT_BOTTOM_THRESHOLD_PX = 60;

// The ONE chat screen used by both the teacher's and student's class detail
// routes — role-agnostic, same pattern as ProfileScreen: it reads the
// caller's own role from AuthProvider and renders identically either way.
export function ClassChatScreen({ classId }: ClassChatScreenProps) {
  const { firebaseUser, profile } = useAuth();
  const listRef = useRef<FlatList<ChatTimelineItem>>(null);
  const isAtBottomRef = useRef(true);
  const lastNewestIdRef = useRef<string | null>(null);
  const [showNewMessageIndicator, setShowNewMessageIndicator] = useState(false);

  const sender: ChatSender | null =
    firebaseUser && profile && (profile.role === "teacher" || profile.role === "student")
      ? {
          uid: firebaseUser.uid,
          displayName: profile.displayName || profile.username || "Kullanıcı",
          photoURL: profile.photoURL,
          role: profile.role,
        }
      : null;

  const {
    messages,
    newestLive,
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
    removeMessage,
    moderationError,
  } = useClassChat({ classId, sender });

  // Phase 102 — read cursors. Marks this member's cursor only while the
  // conversation is open in the foreground; the label below is derived from
  // every OTHER member's cursor, so it is per recipient (this is a group).
  const { cursors } = useClassChatReads({ classId, uid: firebaseUser?.uid, newest: newestLive });

  // Auto-scroll to the newest message ONLY when the user is already at the
  // bottom — otherwise (they're reading history) surface the "Yeni Mesaj"
  // indicator instead of yanking their scroll position. Skipped on the very
  // first load: the list already renders at the bottom by default (inverted
  // FlatList's natural resting position), no scroll action needed.
  useEffect(() => {
    const newest = messages[messages.length - 1];
    if (!newest) return;
    const isFirstLoad = lastNewestIdRef.current === null;
    const changed = lastNewestIdRef.current !== newest.id;
    lastNewestIdRef.current = newest.id;
    if (!changed || isFirstLoad) return;

    if (isAtBottomRef.current) {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    } else {
      setShowNewMessageIndicator(true);
    }
  }, [messages]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      const atBottom = offsetY < AT_BOTTOM_THRESHOLD_PX;
      isAtBottomRef.current = atBottom;
      if (atBottom) setShowNewMessageIndicator(false);
    },
    [],
  );

  function scrollToBottom() {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setShowNewMessageIndicator(false);
  }

  // Ascending (oldest first) grouped-with-separators, then reversed ONCE
  // for the inverted FlatList, which wants its data newest-first.
  //
  // Memoized on a content signature rather than on `messages` itself:
  // useClassChat rebuilds that array on every render, so keying the memo on
  // its identity would rebuild the entire timeline — and hand FlatList a
  // new data array — on every keystroke in the composer.
  const signature = chatTimelineSignature(messages);
  const invertedData = useMemo(
    () => buildChatTimeline(messages).reverse(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature],
  );

  // `retryFailed` is a fresh closure on every render of the hook, which
  // would defeat memoization of every bubble. A ref keeps the identity
  // stable while always calling the latest implementation.
  const retryFailedRef = useRef(retryFailed);
  retryFailedRef.current = retryFailed;
  const handleRetry = useCallback((clientMessageId: string) => {
    retryFailedRef.current(clientMessageId);
  }, []);

  const ownUid = firebaseUser?.uid;

  // "Görüldü" belongs to ONE bubble: the sender's newest confirmed message.
  const latestOwn = latestOwnMessage(messages, ownUid);
  const latestOwnId = latestOwn?.id ?? null;
  const latestOwnSeen = latestOwn ? seenLabel(seenCount(latestOwn, cursors)) : null;

  // Phase 102 — the class teacher's remove flow: long-press → sheet →
  // confirm → removeClassMessage. canRemoveMessage gates what is drawn; the
  // server checks classes/{classId}.teacherId again regardless.
  const viewerRole = sender?.role ?? null;
  const [removalTarget, setRemovalTarget] = useState<ChatListMessage | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const handleRemoveRequest = useCallback((message: ChatListMessage) => setRemovalTarget(message), []);
  const removeMessageRef = useRef(removeMessage);
  removeMessageRef.current = removeMessage;

  async function confirmRemoval(message: ChatListMessage) {
    if (isRemoving) return;
    setIsRemoving(true);
    try {
      await removeMessageRef.current(message.id);
    } finally {
      setIsRemoving(false);
      setRemovalTarget(null);
    }
  }

  const keyExtractor = useCallback((item: ChatTimelineItem) => item.id, []);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ChatTimelineItem>) =>
      item.type === "separator" ? (
        <ChatDateSeparator label={item.label} />
      ) : (
        <ChatMessageBubble
          message={item.message}
          isOwnMessage={item.message.senderId === ownUid}
          isFirstInGroup={item.isFirstInGroup}
          isLastInGroup={item.isLastInGroup}
          onRetry={handleRetry}
          seenLabel={item.message.id === latestOwnId ? latestOwnSeen : null}
          canRemove={canRemoveMessage(
            ownUid && viewerRole ? { uid: ownUid, role: viewerRole } : null,
            item.message,
          )}
          onRemove={handleRemoveRequest}
        />
      ),
    [ownUid, viewerRole, handleRetry, latestOwnId, latestOwnSeen, handleRemoveRequest],
  );

  const handleEndReached = useCallback(() => {
    if (hasMoreOlder) loadOlderMessages();
  }, [hasMoreOlder, loadOlderMessages]);

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        // Unchanged from the previous implementation: iOS needs the padding
        // behavior, Android's default windowSoftInputMode already resizes.
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ChatHeader
          fallbackHref={
            profile?.role === "teacher"
              ? { pathname: "/(teacher)/class/[classId]", params: { classId } }
              : { pathname: "/(student)/class/[classId]", params: { classId } }
          }
        />

        {isLoading ? (
          <ChatLoadingSkeleton />
        ) : error ? (
          <View style={styles.centered}>
            <Ionicons name="cloud-offline-outline" size={32} color={colors.textTertiary} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <View style={styles.flex}>
            <Pressable style={styles.flex} onPress={Keyboard.dismiss} accessible={false}>
              <FlatList
                ref={listRef}
                inverted
                data={invertedData}
                keyExtractor={keyExtractor}
                renderItem={renderItem}
                contentContainerStyle={styles.listContent}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                onEndReached={handleEndReached}
                onEndReachedThreshold={0.3}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                ListFooterComponent={
                  // Footer of an inverted list renders at the TOP, which is
                  // exactly where older messages load in.
                  isLoadingOlder ? (
                    <View style={styles.loadingOlder}>
                      <ActivityIndicator color={colors.textTertiary} />
                    </View>
                  ) : null
                }
                ListEmptyComponent={
                  <View style={styles.emptyStateWrapper}>
                    <EmptyState
                      icon="chatbubble-ellipses-outline"
                      title="Sohbet henüz başlamadı"
                      description="Sınıfına ilk mesajı göndererek konuşmayı başlat."
                    />
                  </View>
                }
              />
            </Pressable>

            {showNewMessageIndicator ? (
              <Pressable
                onPress={scrollToBottom}
                style={[styles.newMessagePill, shadows.md]}
                accessibilityRole="button"
                accessibilityLabel="Yeni mesajlara git"
              >
                <Ionicons name="arrow-down" size={14} color={colors.textInverse} />
                <Text style={styles.newMessagePillText}>Yeni Mesaj</Text>
              </Pressable>
            ) : null}
          </View>
        )}

        {sendError ? <ChatErrorBanner message={sendError} /> : null}
        {moderationError ? <ChatErrorBanner message={moderationError} /> : null}

        <ChatComposer draft={draft} onChangeDraft={setDraft} isSending={isSending} onSend={send} />
      </KeyboardAvoidingView>

      <RemoveMessageSheet
        message={removalTarget}
        isRemoving={isRemoving}
        onConfirm={confirmRemoval}
        onClose={() => {
          if (!isRemoving) setRemovalTarget(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  errorText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
  },
  listContent: {
    paddingVertical: spacing.sm,
    flexGrow: 1,
    justifyContent: "flex-end",
  },
  loadingOlder: {
    paddingVertical: spacing.md,
  },
  emptyStateWrapper: {
    marginTop: spacing.xxxl,
    // Cancels the inverted transform so the empty state reads right-side
    // up (ListEmptyComponent is otherwise flipped like every other child
    // of an inverted FlatList).
    transform: [{ scaleY: -1 }],
  },
  newMessagePill: {
    position: "absolute",
    bottom: spacing.sm,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  newMessagePillText: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.textInverse,
  },
}));
