import { Image } from "expo-image";
import { router } from "expo-router";
import { Text, View } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { colors } from "@theme/colors";
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

export function QuestionGridItem({ question, size, showPosterRoleBadge = false }: QuestionGridItemProps) {
  const isTeacherPost = question.posterRole === "teacher";

  return (
    <AnimatedPressable
      style={[styles.item, { width: size, height: size }]}
      onPress={() =>
        router.push({ pathname: "/(student)/question/[questionId]", params: { questionId: question.id } })
      }
      accessibilityRole="button"
      accessibilityLabel="Soruyu aç"
      accessibilityHint="Soru detayını açar"
    >
      <Image source={{ uri: question.imageUrl }} style={styles.image} contentFit="cover" transition={150} />
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
