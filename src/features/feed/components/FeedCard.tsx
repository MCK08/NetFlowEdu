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
// yet. Tapping anywhere on the card opens Question Detail, which is now
// the single entry point into the answer flow (its own "Cevapla" button
// pushes AnswerScreen) — nested Pressables (like/comment) still win over
// the card's own tap, RN only fires the innermost responder for a touch.
export function FeedCard({ question, height, ownerHandle, ownerPhotoURL }: FeedCardProps) {
  return (
    <Pressable
      style={[styles.card, { height }]}
      onPress={() =>
        router.push({ pathname: "/(student)/question/[questionId]", params: { questionId: question.id } })
      }
      accessibilityRole="button"
      accessibilityLabel="Soruyu aç"
    >
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
      </View>

      <View style={styles.actionRail}>
        <Pressable style={styles.actionButton} accessibilityRole="button" accessibilityLabel="Beğen">
          <Ionicons name="heart-outline" size={30} color="white" />
          <Text style={styles.actionCount}>{question.likes}</Text>
        </Pressable>
        <View style={styles.actionButton}>
          <Ionicons name="chatbubble-outline" size={28} color="white" />
          <Text style={styles.actionCount}>{question.answerCount}</Text>
        </View>
      </View>
    </Pressable>
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
