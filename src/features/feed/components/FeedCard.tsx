import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@features/authentication";
import { useProfileHandle } from "@features/profiles";
import { SaveButton, useSavedQuestion } from "@features/questions";
import { LikeButton, useLike } from "@features/social/likes";

import { Question } from "../types";

interface FeedCardProps {
  question: Question;
  height: number;
}

const VISIBILITY_LABELS: Record<Question["visibility"], string> = {
  private: "Sadece Ben",
  public: "Herkese Açık",
  class: "Sınıf",
};

function formatDate(createdAt: number): string {
  if (!createdAt) return "";
  return new Date(createdAt).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Tapping anywhere on the card opens Question Detail, which is the single
// entry point into the answer flow (its own "Cevapla" button pushes
// AnswerScreen) — nested Pressables (owner row, like button) still win
// over the card's own tap, RN only fires the innermost responder for a
// touch.
export function FeedCard({ question, height }: FeedCardProps) {
  const { firebaseUser } = useAuth();
  const { handle, photoURL } = useProfileHandle(question.ownerId);
  const { liked, likeCount, toggle } = useLike({
    targetType: "question",
    targetId: question.id,
    initialLikeCount: question.likeCount,
    uid: firebaseUser?.uid,
  });
  const { saved, toggle: toggleSaved } = useSavedQuestion(question, firebaseUser?.uid);

  function openDetail() {
    router.push({ pathname: "/(student)/question/[questionId]", params: { questionId: question.id } });
  }

  function openOwnerProfile() {
    if (!question.ownerId) return;
    router.push({ pathname: "/(student)/user/[userId]", params: { userId: question.ownerId } });
  }

  return (
    <Pressable
      style={[styles.card, { height }]}
      onPress={openDetail}
      accessibilityRole="button"
      accessibilityLabel="Soruyu aç"
    >
      <Image source={{ uri: question.imageUrl }} style={styles.image} contentFit="cover" />

      <View style={styles.infoOverlay}>
        <Pressable
          style={styles.ownerRow}
          onPress={openOwnerProfile}
          accessibilityRole="button"
          accessibilityLabel="Profili görüntüle"
        >
          {photoURL ? (
            <Image source={{ uri: photoURL }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={16} color="white" />
            </View>
          )}
          <Text style={styles.username} numberOfLines={1}>
            @{handle}
          </Text>
        </Pressable>
        <View style={styles.metaRow}>
          <Text style={styles.date}>{formatDate(question.createdAt)}</Text>
          <Text style={styles.dot}>·</Text>
          <View style={styles.visibilityBadge}>
            <Text style={styles.visibilityText}>{VISIBILITY_LABELS[question.visibility]}</Text>
          </View>
        </View>
      </View>

      <View style={styles.actionRail}>
        <LikeButton liked={liked} likeCount={likeCount} onPress={toggle} />
        <View style={styles.actionButton}>
          <Ionicons name="chatbubble-outline" size={26} color="white" />
          <Text style={styles.actionCount}>{question.commentCount}</Text>
        </View>
        <View style={styles.actionButton}>
          <Ionicons name="documents-outline" size={26} color="white" />
          <Text style={styles.actionCount}>{question.answerCount}</Text>
        </View>
        <SaveButton saved={saved} onPress={toggleSaved} />
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
    minHeight: 44,
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
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  date: {
    color: "white",
    fontSize: 13,
    opacity: 0.85,
  },
  dot: {
    color: "white",
    fontSize: 13,
    opacity: 0.6,
  },
  visibilityBadge: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  visibilityText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
  actionRail: {
    position: "absolute",
    right: 16,
    bottom: 32,
    alignItems: "center",
    gap: 18,
  },
  actionButton: {
    alignItems: "center",
    gap: 4,
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
  },
  actionCount: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
});
