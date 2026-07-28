import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@features/authentication";

import { ChatComposer } from "../components/ChatComposer";
import { ChatDateSeparator } from "../components/ChatDateSeparator";
import { ChatMessageBubble } from "../components/ChatMessageBubble";
import { ChatSender, useClassChat } from "../hooks/useClassChat";
import { ChatListItem, groupMessagesWithDateSeparators } from "../services/chatDateGrouping";

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
  const listRef = useRef<FlatList<ChatListItem>>(null);
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
  } = useClassChat({ classId, sender });

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

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const offsetY = event.nativeEvent.contentOffset.y;
    const atBottom = offsetY < AT_BOTTOM_THRESHOLD_PX;
    isAtBottomRef.current = atBottom;
    if (atBottom && showNewMessageIndicator) setShowNewMessageIndicator(false);
  }

  function scrollToBottom() {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setShowNewMessageIndicator(false);
  }

  // Ascending (oldest first) grouped-with-separators, then reversed ONCE
  // for the inverted FlatList, which wants its data newest-first.
  const invertedData = [...groupMessagesWithDateSeparators(messages)].reverse();

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Geri"
          >
            <Ionicons name="chevron-back" size={24} color="black" />
          </Pressable>
          <Text style={styles.headerTitle}>Sınıf Sohbeti</Text>
        </View>

        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color="black" />
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <View style={styles.flex}>
            <Pressable style={styles.flex} onPress={Keyboard.dismiss} accessible={false}>
              <FlatList
                ref={listRef}
                inverted
                data={invertedData}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) =>
                  item.type === "separator" ? (
                    <ChatDateSeparator label={item.label} />
                  ) : (
                    <ChatMessageBubble
                      message={item.message}
                      isOwnMessage={item.message.senderId === firebaseUser?.uid}
                      onRetry={retryFailed}
                    />
                  )
                }
                contentContainerStyle={styles.listContent}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                onEndReached={() => {
                  if (hasMoreOlder) loadOlderMessages();
                }}
                onEndReachedThreshold={0.3}
                keyboardShouldPersistTaps="handled"
                ListFooterComponent={
                  isLoadingOlder ? (
                    <View style={styles.loadingOlder}>
                      <ActivityIndicator color="black" />
                    </View>
                  ) : null
                }
                ListEmptyComponent={
                  <Text style={styles.emptyText}>Henüz mesaj yok. İlk mesajı sen gönder.</Text>
                }
              />
            </Pressable>

            {showNewMessageIndicator ? (
              <Pressable
                onPress={scrollToBottom}
                style={styles.newMessagePill}
                accessibilityRole="button"
                accessibilityLabel="Yeni mesajlara git"
              >
                <Ionicons name="arrow-down" size={14} color="white" />
                <Text style={styles.newMessagePillText}>Yeni Mesaj</Text>
              </Pressable>
            ) : null}
          </View>
        )}

        {sendError ? <Text style={styles.sendErrorText}>{sendError}</Text> : null}

        <ChatComposer draft={draft} onChangeDraft={setDraft} isSending={isSending} onSend={send} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: "white",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#EDEEF0",
  },
  backButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "black",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  errorText: {
    fontSize: 14,
    color: "#5B5F66",
    textAlign: "center",
  },
  listContent: {
    paddingVertical: 12,
    flexGrow: 1,
    justifyContent: "flex-end",
  },
  loadingOlder: {
    paddingVertical: 16,
  },
  emptyText: {
    fontSize: 14,
    color: "#8A8F98",
    textAlign: "center",
    marginTop: 40,
    paddingHorizontal: 32,
    // Cancels the inverted transform so the empty-state text reads
    // right-side up (ListEmptyComponent is otherwise flipped like every
    // other child of an inverted FlatList).
    transform: [{ scaleY: -1 }],
  },
  newMessagePill: {
    position: "absolute",
    bottom: 12,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#3358D9",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  newMessagePillText: {
    color: "white",
    fontSize: 13,
    fontWeight: "700",
  },
  sendErrorText: {
    color: "#D92D20",
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 16,
    paddingTop: 6,
  },
});
