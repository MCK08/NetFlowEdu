import { router } from "expo-router";
import { useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PrimaryButton } from "@components/ui/PrimaryButton";
import { Divider } from "@components/ui/Divider";
import { EmptyState } from "@components/ui/EmptyState";
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
import { themedStyles } from "@theme/themeRuntime";

import { QuestionDetailCard } from "../components/QuestionDetailCard";
import { QuestionHeader } from "../components/QuestionHeader";
import { MultipleChoiceAnswer } from "../components/MultipleChoiceAnswer";
import { QuestionHintLadder } from "../components/QuestionHintLadder";
import { useQuestionDetail } from "../hooks/useQuestionDetail";
import { QUESTION_GENERIC_ERROR_MESSAGE } from "../services/questionDetailService";
import { hasMultipleChoice } from "../services/multipleChoice";

interface QuestionDetailScreenProps {
  questionId: string;
}

export function QuestionDetailScreen({ questionId }: QuestionDetailScreenProps) {
  const { firebaseUser, role } = useAuth();
  const isStudent = role === "student";
  const { question, isLoading, errorMessage, failure, reload } = useQuestionDetail(questionId);
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
    // Phase 75 — this was a bare centred sentence with no way forward, on the
    // one screen a deep link is most likely to land on. Every comparable
    // screen in the app already reports a failed read as an EmptyState with
    // "Tekrar Dene"; this one did not, even though the hook has always
    // exposed `reload`.
    //
    // Retry is offered ONLY for `unavailable`. "Bu soru bulunamadı" and
    // "yetkiniz yok" are settled answers — a retry button on them would
    // invite the reader to keep tapping at something that cannot change.
    const canRetry = failure === "unavailable";
    return (
      <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
        <QuestionHeader />
        <View style={styles.centered}>
          <EmptyState
            icon={canRetry ? "cloud-offline-outline" : "help-circle-outline"}
            title={errorMessage ?? QUESTION_GENERIC_ERROR_MESSAGE}
          />
          {canRetry ? (
            <PrimaryButton label="Tekrar Dene" onPress={reload} variant="secondary" />
          ) : null}
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
            {/* Phase 72 — support BEFORE answering, inside the existing
                scroll view. Renders nothing when the author wrote no hints. */}
            <QuestionHintLadder hints={question.hints} />

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

const styles = themedStyles(() => ({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    // Phase 75 — the EmptyState and its retry are two stacked children now.
    gap: spacing.md,
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
}));
