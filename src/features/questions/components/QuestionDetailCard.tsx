import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@features/authentication";
import { useProfileHandle } from "@features/profiles";
import { LikeButton, useLike } from "@features/social/likes";
import { Question } from "@/types/question";

import { SaveButton } from "./SaveButton";
import { useSavedQuestion } from "../hooks/useSavedQuestion";

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

interface QuestionDetailCardProps {
  question: Question;
  answerCount: number;
  onPressImage: (uri: string) => void;
}

export function QuestionDetailCard({ question, answerCount, onPressImage }: QuestionDetailCardProps) {
  const { firebaseUser } = useAuth();
  const { handle, photoURL } = useProfileHandle(question.ownerId);
  const { liked, likeCount, toggle } = useLike({
    targetType: "question",
    targetId: question.id,
    initialLikeCount: question.likeCount,
    uid: firebaseUser?.uid,
  });
  const { saved, toggle: toggleSaved } = useSavedQuestion(question, firebaseUser?.uid);

  function openOwnerProfile() {
    if (!question.ownerId) return;
    router.push({ pathname: "/(student)/user/[userId]", params: { userId: question.ownerId } });
  }

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => onPressImage(question.imageUrl)}
        accessibilityRole="button"
        accessibilityLabel="Soru görselini büyüt"
      >
        <Image source={{ uri: question.imageUrl }} style={styles.image} contentFit="cover" />
      </Pressable>

      <View style={styles.metaRow}>
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
              <Ionicons name="person" size={16} color="#8A8F98" />
            </View>
          )}
          <Text style={styles.owner} numberOfLines={1}>
            @{handle}
          </Text>
        </Pressable>

        <View style={styles.infoRow}>
          <Text style={styles.infoText}>{formatDate(question.createdAt)}</Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.infoText}>{VISIBILITY_LABELS[question.visibility]}</Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.infoText}>{answerCount} cevap</Text>
        </View>

        <View style={styles.actionsRow}>
          <LikeButton liked={liked} likeCount={likeCount} onPress={toggle} size={22} color="#5B5F66" />
          <SaveButton saved={saved} onPress={toggleSaved} size={22} color="#5B5F66" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  image: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: 16,
    backgroundColor: "#F2F2F2",
  },
  metaRow: {
    gap: 8,
  },
  ownerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F2F2F2",
    alignItems: "center",
    justifyContent: "center",
  },
  owner: {
    fontSize: 16,
    fontWeight: "700",
    color: "black",
    flexShrink: 1,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  infoText: {
    fontSize: 13,
    color: "#5B5F66",
  },
  dot: {
    fontSize: 13,
    color: "#C4C7CC",
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
});
