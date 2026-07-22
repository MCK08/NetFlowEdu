import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { AnswerCard } from "./AnswerCard";
import { Answer } from "../types";

interface AnswerListProps {
  answers: Answer[];
  isLoading: boolean;
  error: string | null;
  onPressImage: (uri: string) => void;
}

export function AnswerList({ answers, isLoading, error, onPressImage }: AnswerListProps) {
  if (isLoading) {
    return (
      <View style={styles.stateContainer}>
        <ActivityIndicator color="black" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.stateContainer}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (answers.length === 0) {
    return (
      <View style={styles.stateContainer}>
        <Text style={styles.emptyTitle}>Henüz cevap yüklenmedi</Text>
        <Text style={styles.emptySubtitle}>Bu soruya ilk cevabı sen yükleyebilirsin.</Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {answers.map((answer) => (
        <AnswerCard key={answer.id} answer={answer} onPressImage={onPressImage} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stateContainer: {
    paddingVertical: 32,
    alignItems: "center",
    gap: 6,
  },
  errorText: {
    fontSize: 14,
    color: "#D92D20",
    textAlign: "center",
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "black",
  },
  emptySubtitle: {
    fontSize: 13,
    color: "#5B5F66",
    textAlign: "center",
    paddingHorizontal: 24,
  },
  list: {
    gap: 12,
  },
});
