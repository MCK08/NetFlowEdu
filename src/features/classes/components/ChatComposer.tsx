import { StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@components/ui/PrimaryButton";

import { MAX_MESSAGE_LENGTH } from "../services/messageValidation";

interface ChatComposerProps {
  draft: string;
  onChangeDraft: (value: string) => void;
  isSending: boolean;
  onSend: () => void;
}

// The ONE composer used by both TeacherClassChatScreen and
// StudentClassChatScreen (via the shared ClassChatScreen) — never
// duplicated per role. Multiline TextInput between minHeight/maxHeight
// auto-grows with content up to the cap. Rendered outside the page's
// FlatList, pinned to the bottom by the parent's KeyboardAvoidingView —
// same structural pattern as CommentComposer (src/features/social/comments).
export function ChatComposer({ draft, onChangeDraft, isSending, onSend }: ChatComposerProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.row, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <TextInput
        value={draft}
        onChangeText={onChangeDraft}
        placeholder="Mesaj yaz..."
        placeholderTextColor="#8A8F98"
        style={styles.input}
        multiline
        maxLength={MAX_MESSAGE_LENGTH}
        accessibilityLabel="Mesaj yaz"
      />
      <View style={styles.sendButton}>
        <PrimaryButton
          label="Gönder"
          onPress={onSend}
          isLoading={isSending}
          disabled={!draft.trim()}
        />
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
    paddingTop: 12,
    backgroundColor: "white",
    borderTopWidth: 1,
    borderTopColor: "#EDEEF0",
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  sendButton: {
    minWidth: 88,
  },
});
