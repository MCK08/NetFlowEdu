import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { ChatListMessage } from "@/types/message";

function formatTime(createdAt: number): string {
  if (!createdAt) return "";
  return new Date(createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

interface ChatMessageBubbleProps {
  message: ChatListMessage;
  isOwnMessage: boolean;
  onRetry?: (clientMessageId: string) => void;
}

export function ChatMessageBubble({ message, isOwnMessage, onRetry }: ChatMessageBubbleProps) {
  const isFailed = message.status === "failed";
  const isPending = message.status === "pending";

  return (
    <View style={[styles.row, isOwnMessage ? styles.rowOwn : null]}>
      {!isOwnMessage ? (
        message.senderPhoto ? (
          <Image source={{ uri: message.senderPhoto }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Ionicons name="person" size={14} color="#8A8F98" />
          </View>
        )
      ) : null}

      <View style={styles.bubbleColumn}>
        <View
          style={[
            styles.bubble,
            isOwnMessage ? styles.bubbleOwn : styles.bubbleOther,
            isFailed ? styles.bubbleFailed : null,
          ]}
        >
          {!isOwnMessage ? (
            <View style={styles.senderRow}>
              <Text style={styles.senderName} numberOfLines={1}>
                {message.senderName}
              </Text>
              {message.senderRole === "teacher" ? (
                <View style={styles.teacherBadge}>
                  <Text style={styles.teacherBadgeText}>Öğretmen</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <Text style={[styles.text, isOwnMessage ? styles.textOwn : null]}>{message.text}</Text>

          <View style={styles.metaRow}>
            {isPending ? (
              <ActivityIndicator size="small" color={isOwnMessage ? "white" : "#8A8F98"} />
            ) : (
              <Text style={[styles.time, isOwnMessage ? styles.timeOwn : null]}>
                {formatTime(message.createdAt)}
              </Text>
            )}
          </View>
        </View>

        {isFailed ? (
          <Pressable
            onPress={() => onRetry?.(message.clientMessageId)}
            style={styles.retryRow}
            accessibilityRole="button"
            accessibilityLabel="Mesajı tekrar gönder"
          >
            <Ionicons name="alert-circle" size={14} color="#D92D20" />
            <Text style={styles.retryText}>Gönderilemedi. Tekrar dene</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  rowOwn: {
    justifyContent: "flex-end",
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  avatarPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#F2F2F2",
    alignItems: "center",
    justifyContent: "center",
  },
  bubbleColumn: {
    maxWidth: "78%",
    gap: 4,
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 2,
  },
  bubbleOwn: {
    backgroundColor: "#3358D9",
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: "#F2F2F2",
    borderBottomLeftRadius: 4,
  },
  bubbleFailed: {
    opacity: 0.6,
  },
  senderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  senderName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#5B5F66",
    flexShrink: 1,
  },
  teacherBadge: {
    backgroundColor: "#3358D9",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  teacherBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "white",
  },
  text: {
    fontSize: 14,
    color: "#1A1A1A",
  },
  textOwn: {
    color: "white",
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    minHeight: 14,
  },
  time: {
    fontSize: 10,
    color: "#8A8F98",
  },
  timeOwn: {
    color: "rgba(255,255,255,0.75)",
  },
  retryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-end",
  },
  retryText: {
    fontSize: 11,
    color: "#D92D20",
    fontWeight: "600",
  },
});
