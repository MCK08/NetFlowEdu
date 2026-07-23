import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PrimaryButton } from "@components/ui/PrimaryButton";
import { ImageViewer } from "@components/ImageViewer";
import { AnswerList, useQuestionAnswers } from "@features/answers";
import { useAuth } from "@features/authentication";
import { CommentSection } from "@features/social/comments";

import { QuestionDetailCard } from "../components/QuestionDetailCard";
import { QuestionHeader } from "../components/QuestionHeader";
import { useQuestionDetail } from "../hooks/useQuestionDetail";

interface QuestionDetailScreenProps {
  questionId: string;
}

export function QuestionDetailScreen({ questionId }: QuestionDetailScreenProps) {
  const { firebaseUser } = useAuth();
  const { question, isLoading, errorMessage } = useQuestionDetail(questionId);
  const { answers, isLoading: answersLoading, error: answersError } = useQuestionAnswers(
    question ? questionId : undefined,
  );
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  function handleAnswer() {
    if (!question) return;
    router.push({
      pathname: "/(student)/answer/[questionId]",
      params: { questionId, visibility: question.visibility },
    });
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
        <QuestionHeader />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="black" />
        </View>
      </SafeAreaView>
    );
  }

  if (errorMessage || !question) {
    return (
      <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
        <QuestionHeader />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{errorMessage ?? "Soru yüklenirken bir hata oluştu."}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <QuestionHeader title="Soru" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <QuestionDetailCard
          question={question}
          answerCount={answers.length}
          onPressImage={setPreviewUri}
        />

        <PrimaryButton label="Cevapla" onPress={handleAnswer} />

        <View style={styles.answersSection}>
          <Text style={styles.answersTitle}>Cevaplar</Text>
          <AnswerList
            answers={answers}
            isLoading={answersLoading}
            error={answersError}
            onPressImage={setPreviewUri}
          />
        </View>

        <CommentSection questionId={questionId} uid={firebaseUser?.uid} />
      </ScrollView>

      <ImageViewer visible={previewUri !== null} uri={previewUri} onClose={() => setPreviewUri(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: "white",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  errorText: {
    fontSize: 15,
    color: "#5B5F66",
    textAlign: "center",
  },
  content: {
    padding: 24,
    gap: 16,
  },
  answersSection: {
    gap: 12,
    marginTop: 8,
  },
  answersTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "black",
  },
});
