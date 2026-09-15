import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { Avatar } from "@components/ui/Avatar";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";
import { ChatListMessage } from "@/types/message";
import { useThemeSubscription } from "@theme/ThemeProvider";

import { REMOVE_MESSAGE_ACTION_LABEL, REMOVED_MESSAGE_PLACEHOLDER } from "../services/messageModeration";

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
  // Phase 102 — "Görüldü" (or "Görüldü · N" in a group), set by the screen on
  // the sender's newest confirmed message only; null everywhere else.
  seenLabel?: string | null;
  // Phase 102 — the class teacher's remove affordance. The screen decides
  // (canRemoveMessage) and the server decides again; the bubble only offers
  // a long-press — deliberately quiet: no button, no red, nothing a student
  // ever sees.
  canRemove?: boolean;
  onRemove?: (message: ChatListMessage) => void;
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
  seenLabel = null,
  canRemove = false,
  onRemove,
}: ChatMessageBubbleProps) {
  // Phase 49 — memo() blocks prop-driven re-renders, but NOT context
  // updates; without this subscription this component would keep its
  // previous theme's styles after a live theme switch.
  useThemeSubscription();
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
  const isRemoved = message.deleted;
  const body = isRemoved ? REMOVED_MESSAGE_PLACEHOLDER : message.text;
  // Own/incoming must not be conveyed by colour and alignment alone.
  const accessibilityLabel =
    (isOwnMessage ? `Senin mesajın: ${body}` : `${message.senderName}, ${roleLabel}: ${body}`) +
    (time ? `, ${time}` : "") +
    (seenLabel ? `, ${seenLabel}` : "");
  const offersRemove = canRemove && !isRemoved && Boolean(onRemove);

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

        <Pressable
          accessible
          accessibilityLabel={accessibilityLabel}
          // A long-press is the remove gesture on every platform (web
          // included); the accessibility action makes the same thing
          // reachable from a screen reader's actions menu.
          onLongPress={offersRemove ? () => onRemove?.(message) : undefined}
          accessibilityActions={offersRemove ? [{ name: "longpress", label: REMOVE_MESSAGE_ACTION_LABEL }] : undefined}
          onAccessibilityAction={
            offersRemove
              ? (event) => {
                  if (event.nativeEvent.actionName === "longpress") onRemove?.(message);
                }
              : undefined
          }
          style={[
            styles.bubble,
            isOwnMessage ? styles.bubbleOwn : styles.bubbleOther,
            tailStyle,
            isFailed ? styles.bubbleFailed : null,
            isRemoved ? styles.bubbleRemoved : null,
          ]}
        >
          <Text
            style={[
              styles.text,
              isOwnMessage ? styles.textOwn : null,
              isRemoved ? (isOwnMessage ? styles.textRemovedOwn : styles.textRemoved) : null,
            ]}
          >
            {body}
          </Text>

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
        </Pressable>

        {seenLabel ? (
          <Text style={styles.seen} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {seenLabel}
          </Text>
        ) : null}

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

const styles = themedStyles(() => ({
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
  // A removed message keeps its place and its time; only the words are gone.
  bubbleRemoved: {
    opacity: 0.7,
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
  textRemoved: {
    fontStyle: "italic",
    color: colors.textSecondary,
  },
  textRemovedOwn: {
    fontStyle: "italic",
  },
  seen: {
    ...typography.label,
    fontSize: 10,
    fontWeight: "500",
    color: colors.textTertiary,
    alignSelf: "flex-end",
    paddingRight: spacing.xxs,
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
}));
