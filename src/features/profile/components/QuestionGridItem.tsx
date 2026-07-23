import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, StyleSheet } from "react-native";

import { Question } from "@/types/question";

const GRID_GAP = 2;

interface QuestionGridItemProps {
  question: Question;
  size: number;
}

export function QuestionGridItem({ question, size }: QuestionGridItemProps) {
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
});
