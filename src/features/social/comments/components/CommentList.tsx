import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { QuestionComment } from "@/types/comment";

import { CommentItem } from "./CommentItem";

interface CommentListProps {
  comments: QuestionComment[];
  isLoading: boolean;
  error: string | null;
  currentUid: string | undefined;
  onDelete: (commentId: string) => void;
}

// Pure list rendering — no input here, see CommentComposer. Lives inside
// the scrollable page content (QuestionDetailScreen); the composer is
// rendered separately, pinned above the keyboard.
export function CommentList({ comments, isLoading, error, currentUid, onDelete }: CommentListProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Yorumlar</Text>

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
              isOwnComment={comment.ownerId === currentUid}
              onDelete={onDelete}
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
