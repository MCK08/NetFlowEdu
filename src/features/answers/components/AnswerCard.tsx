import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@features/authentication";
import { useProfileHandle } from "@features/profiles";
import { LikeButton, useLike } from "@features/social/likes";

import { AnswerMethodBadge } from "./AnswerMethodBadge";
import { Answer } from "../types";

interface AnswerCardProps {
  answer: Answer;
  onPressImage: (uri: string) => void;
}

function formatDate(createdAt: number): string {
  if (!createdAt) return "";
  return new Date(createdAt).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function AnswerCard({ answer, onPressImage }: AnswerCardProps) {
  const { firebaseUser } = useAuth();
  const { handle, photoURL } = useProfileHandle(answer.ownerId);
  const { liked, likeCount, toggle } = useLike({
    targetType: "answer",
    targetId: answer.id,
    initialLikeCount: answer.likeCount,
    uid: firebaseUser?.uid,
  });

  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => onPressImage(answer.imageUrl)}
        accessibilityRole="button"
        accessibilityLabel="Cevap görselini büyüt"
      >
        <Image source={{ uri: answer.imageUrl }} style={styles.image} contentFit="cover" />
      </Pressable>

      <View style={styles.footer}>
        <Pressable
          style={styles.authorRow}
          onPress={() => {
            if (answer.ownerId) {
              router.push({ pathname: "/(student)/user/[userId]", params: { userId: answer.ownerId } });
            }
          }}
          accessibilityRole="button"
          accessibilityLabel="Profili görüntüle"
        >
          {photoURL ? (
            <Image source={{ uri: photoURL }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={14} color="#8A8F98" />
            </View>
          )}
          <Text style={styles.author} numberOfLines={1}>
            @{handle}
          </Text>
          <Text style={styles.date}>{formatDate(answer.createdAt)}</Text>
        </Pressable>
        <View style={styles.bottomRow}>
          <AnswerMethodBadge method={answer.method} />
          <LikeButton
            liked={liked}
            likeCount={likeCount}
            onPress={toggle}
            size={20}
            color="#5B5F66"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    backgroundColor: "#F7F7F8",
    overflow: "hidden",
    gap: 10,
  },
  image: {
    width: "100%",
    aspectRatio: 4 / 3,
    backgroundColor: "#E5E5E5",
  },
  footer: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  avatarPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#E5E5E5",
    alignItems: "center",
    justifyContent: "center",
  },
  author: {
    fontSize: 13,
    fontWeight: "700",
    color: "black",
    flexShrink: 1,
  },
  date: {
    fontSize: 12,
    color: "#8A8F98",
    marginLeft: "auto",
  },
});
