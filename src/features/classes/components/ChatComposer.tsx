import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { Divider } from "@components/ui/Divider";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

import { MAX_MESSAGE_LENGTH } from "../services/messageValidation";

interface ChatComposerProps {
  draft: string;
  onChangeDraft: (value: string) => void;
  isSending: boolean;
  onSend: () => void;
}

// The ONE composer used by both the teacher's and the student's class chat
// route (via the shared ClassChatScreen) — never duplicated per role.
// Multiline TextInput between minHeight/maxHeight auto-grows with content
// up to the cap. Rendered outside the page's FlatList, pinned to the bottom
// by the parent's KeyboardAvoidingView.
//
// The send flow is untouched: same `onSend` callback, same `isSending`
// state, same `MAX_MESSAGE_LENGTH`, same empty-draft disabling. What
// changed is the shape — a pill-shaped field plus a circular icon button,
// instead of a bordered rectangle next to a wide "Gönder" text button that
// ate roughly a third of the row on a small phone.
export function ChatComposer({ draft, onChangeDraft, isSending, onSend }: ChatComposerProps) {
  const insets = useSafeAreaInsets();
  const canSend = draft.trim().length > 0 && !isSending;

  return (
    <View style={styles.container}>
      <Divider />
      <View style={[styles.row, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        <TextInput
          value={draft}
          onChangeText={onChangeDraft}
          placeholder="Mesaj yaz..."
          placeholderTextColor={colors.textTertiary}
          style={styles.input}
          multiline
          maxLength={MAX_MESSAGE_LENGTH}
          accessibilityLabel="Mesaj yaz"
          accessibilityHint="Sınıf sohbetine göndermek için mesajınızı yazın"
        />

        <AnimatedPressable
          onPress={onSend}
          disabled={!canSend}
          style={[styles.sendButton, canSend ? styles.sendButtonActive : styles.sendButtonIdle]}
          accessibilityRole="button"
          accessibilityLabel="Mesajı gönder"
          accessibilityState={{ disabled: !canSend, busy: isSending }}
        >
          {isSending ? (
            <ActivityIndicator size="small" color={colors.textInverse} />
          ) : (
            <Ionicons
              name="arrow-up"
              size={20}
              color={canSend ? colors.textInverse : colors.textTertiary}
            />
          )}
        </AnimatedPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
  },
  input: {
    flex: 1,
    // Grows with the text but never past maxHeight, so a long draft
    // scrolls inside the field instead of pushing the timeline off screen.
    minHeight: minTouchTarget,
    maxHeight: 120,
    borderRadius: radius.xxl,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
    ...typography.body,
    fontSize: 15,
    color: colors.textPrimary,
  },
  sendButton: {
    width: minTouchTarget,
    height: minTouchTarget,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonActive: {
    backgroundColor: colors.primary,
  },
  // Stays visible but obviously inert, rather than disappearing — the
  // disabled state is exposed to screen readers via accessibilityState too,
  // so it is not signalled by colour alone.
  sendButtonIdle: {
    backgroundColor: colors.surfaceMuted,
  },
});
