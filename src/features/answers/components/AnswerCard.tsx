import { Image } from "expo-image";
import { router } from "expo-router";
import { Text, View } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { Avatar } from "@components/ui/Avatar";
import { useAuth } from "@features/authentication";
import { useProfileHandle } from "@features/profiles";
import { LikeButton, useLike } from "@features/social/likes";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { minTouchTarget } from "@theme/sizes";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";

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
  const { primaryName, usernameHandle, photoURL } = useProfileHandle(answer.ownerId);
  const { liked, likeCount, toggle } = useLike({
    targetType: "answer",
    targetId: answer.id,
    initialLikeCount: answer.likeCount,
    uid: firebaseUser?.uid,
  });

  return (
    <View style={styles.card}>
      <AnimatedPressable
        onPress={() => onPressImage(answer.imageUrl)}
        accessibilityRole="button"
        accessibilityLabel="Cevap görselini büyüt"
        accessibilityHint="Görseli tam ekran açar"
      >
        <Image
          source={{ uri: answer.imageUrl }}
          style={styles.image}
          contentFit="cover"
          transition={150}
        />
      </AnimatedPressable>

      <View style={styles.footer}>
        <AnimatedPressable
          style={styles.authorRow}
          onPress={() => {
            if (answer.ownerId) {
              router.push({ pathname: "/(student)/user/[userId]", params: { userId: answer.ownerId } });
            }
          }}
          accessibilityRole="button"
          accessibilityLabel="Profili görüntüle"
          accessibilityHint={`${primaryName} adlı kullanıcının profilini açar`}
        >
          <Avatar photoURL={photoURL} displayName={primaryName} size="sm" />
          <View style={styles.nameColumn}>
            <Text style={styles.author} numberOfLines={1}>
              {primaryName}
            </Text>
            {usernameHandle ? (
              <Text style={styles.handle} numberOfLines={1}>
                {usernameHandle}
              </Text>
            ) : null}
          </View>
          <Text style={styles.date}>{formatDate(answer.createdAt)}</Text>
        </AnimatedPressable>
        <View style={styles.bottomRow}>
          <AnswerMethodBadge method={answer.method} />
          <LikeButton
            liked={liked}
            likeCount={likeCount}
            onPress={toggle}
            size={20}
            color={colors.textSecondary}
          />
        </View>
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  card: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    overflow: "hidden",
    gap: spacing.sm,
  },
  image: {
    width: "100%",
    aspectRatio: 4 / 3,
    backgroundColor: colors.surfaceMuted,
  },
  footer: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: minTouchTarget,
  },
  nameColumn: {
    flexShrink: 1,
  },
  author: {
    ...typography.bodyStrong,
    fontSize: 13,
    color: colors.textPrimary,
  },
  handle: {
    fontSize: 11,
    color: colors.textTertiary,
  },
  date: {
    ...typography.caption,
    color: colors.textTertiary,
    marginLeft: "auto",
  },
}));
