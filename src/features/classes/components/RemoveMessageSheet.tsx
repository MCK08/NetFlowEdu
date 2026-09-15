import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { BottomActionSheet } from "@components/ui/BottomActionSheet";
import { ListCard } from "@components/ui/ListCard";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { ChatListMessage } from "@/types/message";

import {
  REMOVE_MESSAGE_ACTION_LABEL,
  REMOVE_MESSAGE_CANCEL_LABEL,
  REMOVE_MESSAGE_CONFIRM_LABEL,
  REMOVE_MESSAGE_CONFIRM_TITLE,
} from "../services/messageModeration";

interface RemoveMessageSheetProps {
  /** The student message the teacher long-pressed; null closes the sheet. */
  message: ChatListMessage | null;
  isRemoving: boolean;
  onConfirm: (message: ChatListMessage) => void;
  onClose: () => void;
}

// Phase 102 — the class teacher's one moderation action, in two quiet steps
// on the app's shared sheet: the action ("Mesajı kaldır"), then a plain
// confirmation. No reason field, no red banner, no destructive styling —
// removing a line from a class conversation is a small, deliberate act and
// the surface should read that way. Works the same on web and native
// (a real RN Modal, unlike Alert.alert which the web build ignores).
export function RemoveMessageSheet({ message, isRemoving, onConfirm, onClose }: RemoveMessageSheetProps) {
  useThemeSubscription();
  const [step, setStep] = useState<"action" | "confirm">("action");

  // A fresh long-press always starts at the action step.
  useEffect(() => {
    if (message) setStep("action");
  }, [message]);

  return (
    <BottomActionSheet visible={message !== null} onClose={onClose}>
      {step === "action" ? (
        <View style={styles.actions}>
          {message ? (
            <Text style={styles.excerpt} numberOfLines={2}>
              {message.senderName}: {message.text}
            </Text>
          ) : null}
          <ListCard
            leading={<Ionicons name="remove-circle-outline" size={20} color={colors.textPrimary} />}
            title={REMOVE_MESSAGE_ACTION_LABEL}
            onPress={() => setStep("confirm")}
          />
          <PrimaryButton label={REMOVE_MESSAGE_CANCEL_LABEL} variant="secondary" onPress={onClose} />
        </View>
      ) : (
        <View style={styles.actions}>
          <Text style={styles.question}>{REMOVE_MESSAGE_CONFIRM_TITLE}</Text>
          <PrimaryButton
            label={REMOVE_MESSAGE_CONFIRM_LABEL}
            onPress={() => {
              if (message) onConfirm(message);
            }}
            isLoading={isRemoving}
          />
          <PrimaryButton
            label={REMOVE_MESSAGE_CANCEL_LABEL}
            variant="secondary"
            onPress={onClose}
            disabled={isRemoving}
          />
        </View>
      )}
    </BottomActionSheet>
  );
}

const styles = themedStyles(() => ({
  actions: {
    gap: spacing.sm,
  },
  excerpt: {
    ...typography.caption,
    color: colors.textSecondary,
    paddingHorizontal: spacing.xs,
  },
  question: {
    ...typography.subtitle,
    color: colors.textPrimary,
    textAlign: "center",
    paddingBottom: spacing.xs,
  },
}));
