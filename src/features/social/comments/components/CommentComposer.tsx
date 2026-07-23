import { StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@components/ui/PrimaryButton";

interface CommentComposerProps {
  draft: string;
  onChangeDraft: (value: string) => void;
  isSubmitting: boolean;
  onSubmit: () => void;
}

// Rendered outside the page's ScrollView, pinned to the bottom by the
// parent's KeyboardAvoidingView (see QuestionDetailScreen) — this is what
// keeps it directly above the keyboard and the Send button always visible,
// instead of being covered like the old inline composer was.
export function CommentComposer({ draft, onChangeDraft, isSubmitting, onSubmit }: CommentComposerProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.row, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <TextInput
        value={draft}
        onChangeText={onChangeDraft}
        placeholder="Bir yorum yaz..."
        placeholderTextColor="#8A8F98"
        style={styles.input}
        multiline
        maxLength={500}
        accessibilityLabel="Yorum yaz"
      />
      <View style={styles.sendButton}>
        <PrimaryButton
          label="Gönder"
          onPress={onSubmit}
          isLoading={isSubmitting}
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
