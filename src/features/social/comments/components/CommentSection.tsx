import { ActivityIndicator, StyleSheet, Text, TextInput, View } from "react-native";

import { PrimaryButton } from "@components/ui/PrimaryButton";

import { useQuestionComments } from "../hooks/useQuestionComments";
import { CommentItem } from "./CommentItem";

interface CommentSectionProps {
  questionId: string;
  uid: string | undefined;
}

export function CommentSection({ questionId, uid }: CommentSectionProps) {
  const { comments, isLoading, error, draft, setDraft, isSubmitting, submit, remove } =
    useQuestionComments({ questionId, uid });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Yorumlar</Text>

      <View style={styles.inputRow}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Bir yorum yaz..."
          placeholderTextColor="#8A8F98"
          style={styles.input}
          multiline
          maxLength={500}
          accessibilityLabel="Yorum yaz"
        />
        <PrimaryButton label="Gönder" onPress={submit} isLoading={isSubmitting} disabled={!draft.trim()} />
      </View>

      {isLoading ? (
        <ActivityIndicator color="black" style={styles.loading} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : comments.length === 0 ? (
        <Text style={styles.emptyText}>Henüz yorum yapılmadı.</Text>
      ) : (
        <View>
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              isOwnComment={comment.ownerId === uid}
              onDelete={remove}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "black",
  },
  inputRow: {
    gap: 8,
  },
  input: {
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  loading: {
    marginVertical: 12,
  },
  errorText: {
    fontSize: 14,
    color: "#5B5F66",
    textAlign: "center",
    marginVertical: 12,
  },
  emptyText: {
    fontSize: 14,
    color: "#8A8F98",
    textAlign: "center",
    marginVertical: 12,
  },
});
