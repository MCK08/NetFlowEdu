import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

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
    <Pressable
      style={[styles.item, { width: size, height: size }]}
      onPress={() =>
        router.push({ pathname: "/(student)/question/[questionId]", params: { questionId: question.id } })
      }
      accessibilityRole="button"
      accessibilityLabel="Soruyu aç"
    >
      <Image source={{ uri: question.imageUrl }} style={styles.image} contentFit="cover" />
      {showPosterRoleBadge ? (
        <View style={[styles.roleBadge, isTeacherPost ? styles.roleBadgeTeacher : styles.roleBadgeStudent]}>
          <Text style={styles.roleBadgeText}>{isTeacherPost ? "Öğretmen" : "Öğrenci"}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: {
    padding: GRID_GAP / 2,
  },
  image: {
    flex: 1,
    borderRadius: 4,
    backgroundColor: "#F2F2F2",
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
    backgroundColor: "#3358D9",
  },
  roleBadgeStudent: {
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  roleBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "white",
  },
});
