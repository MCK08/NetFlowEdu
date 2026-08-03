import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { Avatar } from "@components/ui/Avatar";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { ChatListMessage } from "@/types/message";

// Reserved gutter so every incoming bubble in a group lines up on the same
// left edge, whether or not this particular row draws the avatar.
const AVATAR_SIZE = 32;
const TAIL_RADIUS = 4;

function formatTime(createdAt: number): string {
  if (!createdAt) return "";
  return new Date(createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

interface ChatMessageBubbleProps {
  message: ChatListMessage;
  isOwnMessage: boolean;
  // Group position, derived once per timeline build by
  // services/chatTimeline — the bubble itself never inspects its
  // neighbours.
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  onRetry?: (clientMessageId: string) => void;
}

// memo'd because the screen re-renders on every composer keystroke (draft
// state lives in useClassChat, one level above): without this, typing a
// message re-rendered every bubble in the conversation.
export const ChatMessageBubble = memo(function ChatMessageBubble({
  message,
  isOwnMessage,
  isFirstInGroup,
  isLastInGroup,
  onRetry,
}: ChatMessageBubbleProps) {
  const isFailed = message.status === "failed";
  const isPending = message.status === "pending";
  const time = formatTime(message.createdAt);

  // Only the newest bubble of a run gets the "tail" corner, so a group
  // reads as one connected block instead of a stack of identical pills.
  const tailStyle = isLastInGroup
    ? isOwnMessage
      ? styles.tailOwn
      : styles.tailOther
    : null;

  const roleLabel = message.senderRole === "teacher" ? "Öğretmen" : "Öğrenci";
  // Own/incoming must not be conveyed by colour and alignment alone.
  const accessibilityLabel = isOwnMessage
    ? `Senin mesajın: ${message.text}${time ? `, ${time}` : ""}`
    : `${message.senderName}, ${roleLabel}: ${message.text}${time ? `, ${time}` : ""}`;

  return (
    <View
      style={[
        styles.row,
        isOwnMessage ? styles.rowOwn : null,
        isLastInGroup ? styles.rowGroupEnd : styles.rowGrouped,
      ]}
    >
      {!isOwnMessage ? (
        <View style={styles.avatarGutter}>
          {isLastInGroup ? (
            <Avatar photoURL={message.senderPhoto} displayName={message.senderName} size="sm" />
          ) : null}
        </View>
      ) : null}

      <View style={styles.bubbleColumn}>
        {!isOwnMessage && isFirstInGroup ? (
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

        <View
          accessible
          accessibilityLabel={accessibilityLabel}
          style={[
            styles.bubble,
            isOwnMessage ? styles.bubbleOwn : styles.bubbleOther,
            tailStyle,
            isFailed ? styles.bubbleFailed : null,
          ]}
        >
          <Text style={[styles.text, isOwnMessage ? styles.textOwn : null]}>{message.text}</Text>

          {/* Timestamp only on the newest bubble of a run — repeating the
              same minute on every bubble of a burst is noise. */}
          {isLastInGroup || isPending ? (
            <View style={styles.metaRow}>
              {isPending ? (
                <ActivityIndicator
                  size="small"
                  color={isOwnMessage ? colors.textInverse : colors.textTertiary}
                />
              ) : (
                <Text style={[styles.time, isOwnMessage ? styles.timeOwn : null]}>{time}</Text>
              )}
            </View>
          ) : null}
        </View>

        {isFailed ? (
          <Pressable
            onPress={() => onRetry?.(message.clientMessageId)}
            style={styles.retryRow}
            accessibilityRole="button"
            accessibilityLabel="Mesajı tekrar gönder"
          >
            <Ionicons name="alert-circle" size={14} color={colors.danger} />
            <Text style={styles.retryText}>Gönderilemedi. Tekrar dene</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  rowOwn: {
    justifyContent: "flex-end",
  },
  // Tight inside a group, roomier between senders — the spacing itself
  // carries the conversation's rhythm.
  rowGrouped: {
    paddingVertical: 1,
  },
  rowGroupEnd: {
    paddingTop: 1,
    paddingBottom: spacing.sm,
  },
  avatarGutter: {
    width: AVATAR_SIZE,
  },
  bubbleColumn: {
    // Percentage rather than a fixed width so a long message never
    // overflows a small screen and never stretches edge-to-edge on a large
    // one.
    maxWidth: "76%",
    gap: spacing.xxs,
  },
  senderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    paddingLeft: spacing.xs,
    marginBottom: 2,
  },
  senderName: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.textSecondary,
    flexShrink: 1,
  },
  teacherBadge: {
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xxs,
    paddingVertical: 1,
  },
  teacherBadgeText: {
    ...typography.label,
    fontSize: 10,
    color: colors.primary,
  },
  bubble: {
    borderRadius: radius.xl,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  bubbleOwn: {
    backgroundColor: colors.primary,
  },
  bubbleOther: {
    backgroundColor: colors.surfaceMuted,
  },
  tailOwn: {
    borderBottomRightRadius: TAIL_RADIUS,
  },
  tailOther: {
    borderBottomLeftRadius: TAIL_RADIUS,
  },
  bubbleFailed: {
    opacity: 0.6,
  },
  text: {
    ...typography.body,
    fontSize: 15,
    lineHeight: 21,
    color: colors.textPrimary,
  },
  textOwn: {
    color: colors.textInverse,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    minHeight: 14,
    marginTop: 2,
  },
  time: {
    ...typography.label,
    fontSize: 10,
    fontWeight: "500",
    color: colors.textTertiary,
  },
  timeOwn: {
    color: "rgba(255,255,255,0.78)",
  },
  retryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    alignSelf: "flex-end",
    minHeight: 24,
  },
  retryText: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: "600",
    color: colors.danger,
  },
});
