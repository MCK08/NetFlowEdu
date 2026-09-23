import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { colors } from "@theme/colors";
import { iconSize } from "@theme/sizes";
import { themedStyles } from "@theme/themeRuntime";
import { roleLabel } from "@utils/roleLabels";
import { Question } from "@/types/question";

const GRID_GAP = 2;

interface QuestionGridItemProps {
  question: Question;
  size: number;
  // Only meaningful for a class's own grid (TeacherClassDetailScreen), now
  // that both teacher- and student-posted questions can appear side by
  // side there — the profile "Sorularım"/"Kaydettiklerim" grids are always
  // the viewer's own private/public questions, where "who posted this" is
  // always "me" and the badge would be redundant noise. Defaults to hidden
  // so every other existing call site keeps rendering exactly as before.
  showPosterRoleBadge?: boolean;
}

/** What the tile is OF, from the question's own fields. Both are "" on
 *  questions created before Phase 21, so an empty pair says nothing rather
 *  than printing a stray separator. */
function tileSubtitle(question: Question): string | null {
  const parts = [question.subject, question.topic].map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function QuestionGridItem({ question, size, showPosterRoleBadge = false }: QuestionGridItemProps) {
  const isTeacherPost = question.posterRole === "teacher";
  const [imageFailed, setImageFailed] = useState(false);
  const subtitle = tileSubtitle(question);

  return (
    <AnimatedPressable
      style={[styles.item, { width: size, height: size }]}
      onPress={() =>
        router.push({ pathname: "/(student)/question/[questionId]", params: { questionId: question.id } })
      }
      accessibilityRole="button"
      // Phase 122 — every tile used to announce the identical "Soruyu aç", so
      // a screen reader handed the archive a column of indistinguishable
      // buttons. The question already carries what tells them apart.
      accessibilityLabel={subtitle ? `${subtitle} sorusunu aç` : "Soruyu aç"}
      accessibilityHint="Soru detayını açar"
    >
      {imageFailed ? (
        // Phase 122 — a tile whose image cannot load was a bare grey square,
        // indistinguishable from one still loading and from an empty grid.
        // The mark says it is a question that has no preview, which is what
        // is true; tapping it still opens the question.
        <View style={styles.fallback}>
          <Ionicons
            name="image-outline"
            size={iconSize.md}
            color={colors.textTertiary}
            accessibilityElementsHidden
          />
        </View>
      ) : (
        <Image
          source={{ uri: question.imageUrl }}
          style={styles.image}
          contentFit="cover"
          transition={150}
          onError={() => setImageFailed(true)}
        />
      )}
      {showPosterRoleBadge ? (
        <View style={[styles.roleBadge, isTeacherPost ? styles.roleBadgeTeacher : styles.roleBadgeStudent]}>
          <Text style={styles.roleBadgeText}>{roleLabel(question.posterRole)}</Text>
        </View>
      ) : null}
    </AnimatedPressable>
  );
}

const styles = themedStyles(() => ({
  item: {
    padding: GRID_GAP / 2,
  },
  image: {
    flex: 1,
    borderRadius: 4,
    backgroundColor: colors.surfaceMuted,
  },
  fallback: {
    flex: 1,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted,
  },
  roleBadge: {
    position: "absolute",
    left: GRID_GAP / 2 + 4,
    bottom: 4,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  roleBadgeTeacher: {
    backgroundColor: colors.primary,
  },
  roleBadgeStudent: {
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  roleBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.textInverse,
  },
}));
