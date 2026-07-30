import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { Avatar } from "@components/ui/Avatar";
import { useAuth } from "@features/authentication";
import { useProfileHandle } from "@features/profiles";
import { LikeButton, useLike } from "@features/social/likes";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
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
  const { primaryName, usernameHandle, photoURL } = useProfileHandle(question.ownerId);
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
        <AnimatedPressable
          style={styles.ownerRow}
          onPress={openOwnerProfile}
          accessibilityRole="button"
          accessibilityLabel="Profili görüntüle"
        >
          <Avatar photoURL={photoURL} displayName={primaryName} size="sm" />
          <View style={styles.nameColumn}>
            <Text style={styles.owner} numberOfLines={1}>
              {primaryName}
            </Text>
            {usernameHandle ? (
              <Text style={styles.handle} numberOfLines={1}>
                {usernameHandle}
              </Text>
            ) : null}
          </View>
        </AnimatedPressable>

        <View style={styles.infoRow}>
          <Text style={styles.infoText}>{formatDate(question.createdAt)}</Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.infoText}>{VISIBILITY_LABELS[question.visibility]}</Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.infoText}>{answerCount} cevap</Text>
        </View>

        <View style={styles.actionsRow}>
          <LikeButton liked={liked} likeCount={likeCount} onPress={toggle} size={22} color={colors.textSecondary} />
          <SaveButton saved={saved} onPress={toggleSaved} size={22} color={colors.textSecondary} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  image: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceMuted,
  },
  metaRow: {
    gap: spacing.xs,
  },
  ownerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: 44,
  },
  nameColumn: {
    flexShrink: 1,
  },
  owner: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  handle: {
    fontSize: 13,
    color: colors.textTertiary,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  infoText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  dot: {
    fontSize: 13,
    color: "#C4C7CC",
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
});
