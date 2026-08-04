import { StyleSheet, Text, View } from "react-native";

import { EmptyState } from "@components/ui/EmptyState";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
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
        <View style={styles.skeletonList}>
          <LoadingSkeleton height={40} borderRadius={radius.md} />
          <LoadingSkeleton height={40} borderRadius={radius.md} />
        </View>
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : comments.length === 0 ? (
        <EmptyState icon="chatbubble-outline" title="Henüz yorum yapılmadı" />
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
    gap: spacing.sm,
  },
  title: {
    ...typography.title,
    fontSize: 17,
    color: colors.textPrimary,
  },
  skeletonList: {
    gap: spacing.xs,
  },
  errorText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginVertical: spacing.sm,
  },
});
