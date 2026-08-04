import { StyleSheet, Text, View } from "react-native";

import { EmptyState } from "@components/ui/EmptyState";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

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
      <View style={styles.skeletonList}>
        <LoadingSkeleton height={220} borderRadius={radius.xl} />
        <LoadingSkeleton height={220} borderRadius={radius.xl} />
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
      <EmptyState
        icon="document-text-outline"
        title="Henüz cevap yüklenmedi"
        description="Bu soruya ilk cevabı sen yükleyebilirsin."
      />
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
  skeletonList: {
    gap: spacing.sm,
  },
  stateContainer: {
    paddingVertical: spacing.xxl,
    alignItems: "center",
    gap: spacing.xxs,
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
    textAlign: "center",
    paddingHorizontal: spacing.xl,
  },
  list: {
    gap: spacing.sm,
  },
});
