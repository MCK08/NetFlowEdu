import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Question } from "../types";

interface FeedCardProps {
  question: Question;
  height: number;
  ownerHandle: string;
  ownerPhotoURL: string | null;
}

function formatDate(createdAt: number): string {
  if (!createdAt) return "";
  return new Date(createdAt).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Like/comment are presentation-only in this phase — no handlers wired up
// yet. Answer navigates to the dedicated AnswerScreen for this question.
export function FeedCard({ question, height, ownerHandle, ownerPhotoURL }: FeedCardProps) {
  return (
    <View style={[styles.card, { height }]}>
      <Image source={{ uri: question.imageUrl }} style={styles.image} contentFit="cover" />

      <View style={styles.infoOverlay}>
        <View style={styles.ownerRow}>
          {ownerPhotoURL ? (
            <Image source={{ uri: ownerPhotoURL }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={16} color="white" />
            </View>
          )}
          <Text style={styles.username} numberOfLines={1}>
            @{ownerHandle}
          </Text>
        </View>
        <Text style={styles.date}>{formatDate(question.createdAt)}</Text>

        <Pressable
          style={styles.answerButton}
          onPress={() => router.push(`/(student)/answer/${question.id}`)}
          accessibilityRole="button"
          accessibilityLabel="Cevap ver"
        >
          <Text style={styles.answerButtonText}>Cevap Ver</Text>
        </Pressable>
      </View>

      <View style={styles.actionRail}>
        <Pressable style={styles.actionButton} accessibilityRole="button" accessibilityLabel="Beğen">
          <Ionicons name="heart-outline" size={30} color="white" />
          <Text style={styles.actionCount}>{question.likes}</Text>
        </Pressable>
        <Pressable style={styles.actionButton} accessibilityRole="button" accessibilityLabel="Yorum yap">
          <Ionicons name="chatbubble-outline" size={28} color="white" />
          <Text style={styles.actionCount}>{question.comments}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    backgroundColor: "black",
  },
  image: {
    flex: 1,
  },
  infoOverlay: {
    position: "absolute",
    left: 16,
    bottom: 32,
    right: 88,
    gap: 8,
  },
  ownerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  username: {
    color: "white",
    fontSize: 15,
    fontWeight: "700",
    flexShrink: 1,
  },
  date: {
    color: "white",
    fontSize: 13,
    opacity: 0.85,
  },
  answerButton: {
    alignSelf: "flex-start",
    backgroundColor: "white",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  answerButtonText: {
    color: "black",
    fontSize: 14,
    fontWeight: "700",
  },
  actionRail: {
    position: "absolute",
    right: 16,
    bottom: 32,
    alignItems: "center",
    gap: 22,
  },
  actionButton: {
    alignItems: "center",
    gap: 4,
  },
  actionCount: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
});
