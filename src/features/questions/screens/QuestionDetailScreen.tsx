import { router } from "expo-router";
import { useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PrimaryButton } from "@components/ui/PrimaryButton";
import { Divider } from "@components/ui/Divider";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { ImageViewer } from "@components/ImageViewer";
import { AnswerList, useQuestionAnswers } from "@features/answers";
import { useAuth } from "@features/authentication";
import { CommentComposer, CommentList, useQuestionComments } from "@features/social/comments";
import { useNavigationGuard } from "@hooks/useNavigationGuard";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

import { QuestionDetailCard } from "../components/QuestionDetailCard";
import { QuestionHeader } from "../components/QuestionHeader";
import { MultipleChoiceAnswer } from "../components/MultipleChoiceAnswer";
import { useQuestionDetail } from "../hooks/useQuestionDetail";
import { hasMultipleChoice } from "../services/multipleChoice";

interface QuestionDetailScreenProps {
  questionId: string;
}

export function QuestionDetailScreen({ questionId }: QuestionDetailScreenProps) {
  const { firebaseUser, role } = useAuth();
  const isStudent = role === "student";
  const { question, isLoading, errorMessage } = useQuestionDetail(questionId);
  const { answers, isLoading: answersLoading, error: answersError } = useQuestionAnswers(
    question ? questionId : undefined,
  );
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const comments = useQuestionComments({ questionId, uid: firebaseUser?.uid });

  // Real-device bug: double-tapping "Cevapla" pushed AnswerScreen twice, so
  // the student had to press back twice to return. expo-router's push() does
  // not deduplicate. The lock is held until this screen is focused again
  // (i.e. the user actually came back), not for a fixed cooldown — a slow
  // push would outlive any timer. Same guard the class feed uses.
  const guardedNavigate = useNavigationGuard();

  function handleAnswer() {
    if (!question) return;
    guardedNavigate("answer", () => {
      router.push({
        pathname: "/(student)/answer/[questionId]",
        params: { questionId, visibility: question.visibility },
      });
    });
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
        <QuestionHeader />
        <View style={styles.content}>
          <LoadingSkeleton height={340} borderRadius={radius.xl} />
          <LoadingSkeleton width="60%" height={18} />
          <LoadingSkeleton width="40%" height={14} />
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
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <QuestionHeader title="Soru" />

        <Pressable style={styles.flex} onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <QuestionDetailCard
              question={question}
              answerCount={answers.length}
              onPressImage={setPreviewUri}
            />

            {/* Phase 21 — only ever rendered when the question actually has
                a valid multiple-choice answer; every question without one
                (which is every question before this phase, and most after
                it) renders exactly as it always has. */}
            {hasMultipleChoice(question.choices) ? (
              <MultipleChoiceAnswer
                choices={question.choices}
                correctChoice={question.correctChoice}
                questionId={question.id}
                isStudent={isStudent}
              />
            ) : null}

            <PrimaryButton
              label="Cevapla"
              onPress={handleAnswer}
              accessibilityHint="Bu soruya cevap verme ekranını açar"
            />

            <Divider />

            <View style={styles.answersSection}>
              <Text style={styles.answersTitle}>Cevaplar</Text>
              <AnswerList
                answers={answers}
                isLoading={answersLoading}
                error={answersError}
                onPressImage={setPreviewUri}
              />
            </View>

            <Divider />

            <CommentList
              comments={comments.comments}
              isLoading={comments.isLoading}
              error={comments.error}
              currentUid={firebaseUser?.uid}
              onDelete={comments.remove}
            />
          </ScrollView>
        </Pressable>

        <CommentComposer
          draft={comments.draft}
          onChangeDraft={comments.setDraft}
          isSubmitting={comments.isSubmitting}
          onSubmit={comments.submit}
        />
      </KeyboardAvoidingView>

      <ImageViewer visible={previewUri !== null} uri={previewUri} onClose={() => setPreviewUri(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  errorText: {
    ...typography.subtitle,
    color: colors.textSecondary,
    textAlign: "center",
  },
  content: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  answersSection: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  answersTitle: {
    ...typography.title,
    fontSize: 17,
    color: colors.textPrimary,
  },
});
