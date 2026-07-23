import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useProfileHandle } from "@features/profiles";
import { QuestionComment } from "@/types/comment";

function formatDate(createdAt: number): string {
  if (!createdAt) return "";
  return new Date(createdAt).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

interface CommentItemProps {
  comment: QuestionComment;
  isOwnComment: boolean;
  onDelete: (commentId: string) => void;
}

export function CommentItem({ comment, isOwnComment, onDelete }: CommentItemProps) {
  const { handle, photoURL } = useProfileHandle(comment.ownerId);

  return (
    <View style={styles.row}>
      {photoURL ? (
        <Image source={{ uri: photoURL }} style={styles.avatar} contentFit="cover" />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Ionicons name="person" size={14} color="#8A8F98" />
        </View>
      )}

      <View style={styles.body}>
        <View style={styles.headerRow}>
          <Text style={styles.author} numberOfLines={1}>
            @{handle}
          </Text>
          <Text style={styles.date}>{formatDate(comment.createdAt)}</Text>
        </View>
        <Text style={styles.text}>{comment.text}</Text>
      </View>

      {isOwnComment ? (
        <Pressable
          onPress={() => onDelete(comment.id)}
          style={styles.deleteButton}
          accessibilityRole="button"
          accessibilityLabel="Yorumu sil"
          hitSlop={8}
        >
          <Ionicons name="trash-outline" size={16} color="#8A8F98" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 10,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  avatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F2F2F2",
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    gap: 2,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  author: {
    fontSize: 13,
    fontWeight: "700",
    color: "black",
    flexShrink: 1,
  },
  date: {
    fontSize: 11,
    color: "#8A8F98",
  },
  text: {
    fontSize: 14,
    color: "#1A1A1A",
  },
  deleteButton: {
    minWidth: 32,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
  },
});
