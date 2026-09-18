import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@components/ui/Card";
import { EmptyState } from "@components/ui/EmptyState";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { SectionHeader } from "@components/ui/SectionHeader";
import { StatusLabel } from "@components/ui/StatusLabel";
import { useAuth } from "@features/authentication";
import { QuestionHintLadder } from "@features/questions";
import { StudyOutcomeControls, useStudyQuestionState } from "@features/study";
import type { StudyOutcome } from "@features/study";
import { colors } from "@theme/colors";
import { contentWidth } from "@theme/layout";
import { radius } from "@theme/radius";
import { iconSize } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

import { AnalyticsErrorBanner, AnalyticsLoading } from "../components/AnalyticsFeedback";
import { AnalyticsHeader } from "../components/AnalyticsHeader";
import { toneTextColor } from "../components/toneColor";
import { useStudentAnalytics } from "../hooks/useStudentAnalytics";
import { ANALYTICS_ROUTES, questionSolvingRoute } from "../routes";
import {
  ARCHIVE_STATE_ICON,
  ARCHIVE_STATE_LABEL,
  ARCHIVE_STATE_TONE,
  archiveContextSentence,
  lastAttemptLabel,
  retryGuidance,
} from "../services/analyticsPresentation";
import { resolveArchiveState } from "../services/studentAnalytics";

// The feed's own self-report choice (RatingCard's VISIBLE_OUTCOMES): "did it
// go well or not". "Tekrar Et" is a scheduling request, not an answer to that.
const SELF_REPORT_OUTCOMES: readonly StudyOutcome[] = ["struggled", "solved"];

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

// Phase 107 — one archived question, with its context before any retry.
//
// NO SECOND SOLVING ENGINE
//
// "Tekrar Çöz" opens the canonical question screen, which already renders the
// question, evaluates a multiple-choice pick and records it through the one
// recordStudyOutcome (multipleChoiceStudyBridge). A question WITHOUT choices has
// no outcome control on that screen, so for those this screen composes the
// canonical pair every rating surface already uses — useStudyQuestionState +
// StudyOutcomeControls, exactly as RatingCard does — so a retried open question
// can actually become "Sonradan Çözüldü". Nothing here evaluates an answer,
// schedules a review or writes an attempt of its own; the archive simply
// re-reads the persisted evidence afterwards.
//
// "Önceki Yanıtın" is deliberately absent: the product does not reliably keep
// the student's previous answer (a chosen option is recorded only when an
// authored distractor meaning existed), and a placeholder would be invented.
export function ArchivedQuestionScreen() {
  useThemeSubscription();
  const params = useLocalSearchParams<{ questionId?: string | string[] }>();
  const questionId = firstParam(params.questionId);

  const { firebaseUser } = useAuth();
  const { items, loadedAt, isLoading, hasLoaded, error, refresh } = useStudentAnalytics(firebaseUser?.uid);

  const item = useMemo(() => items.find((candidate) => candidate.questionId === questionId) ?? null, [items, questionId]);
  const state = item ? resolveArchiveState(item) : null;
  const isOpenQuestion = Boolean(item?.isQuestionAvailable && item.questionKind === "open");
  const study = useStudyQuestionState({ questionId, enabled: isOpenQuestion && Boolean(questionId) });

  const now = loadedAt;
  const struggledCount = item?.outcomeHistory ? item.outcomeHistory.struggledCount : null;
  const context = state ? archiveContextSentence({ state, struggledCount }) : null;
  const when = item ? lastAttemptLabel(item.lastReviewedAt, now) : null;
  const place = item ? [item.subject, item.topic].filter(Boolean).join(" · ") : "";

  const retry = useCallback(() => {
    router.push(questionSolvingRoute(questionId) as never);
  }, [questionId]);

  const recordRetry = useCallback(
    async (outcome: StudyOutcome) => {
      const result = await study.submit(outcome);
      // A failed write stays on screen via study.mutationError; only a
      // CONFIRMED outcome re-reads the archive.
      if (result !== null) refresh();
    },
    [study, refresh],
  );

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.column}>
          <View style={styles.hero}>
            <AnalyticsHeader
              eyebrow={place || null}
              title="Arşivdeki Soru"
              backFallbackHref={ANALYTICS_ROUTES.archive}
            />
            {state ? (
              <StatusLabel
                icon={ARCHIVE_STATE_ICON[state]}
                tone={ARCHIVE_STATE_TONE[state]}
                size={iconSize.sm}
                textStyle={[styles.state, { color: toneTextColor(ARCHIVE_STATE_TONE[state]) }]}
              >
                {ARCHIVE_STATE_LABEL[state]}
              </StatusLabel>
            ) : null}
          </View>

          {error ? <AnalyticsErrorBanner title="Soru şu an yüklenemedi" message={error} /> : null}
          {isLoading && !hasLoaded ? <AnalyticsLoading blocks={2} /> : null}

          {hasLoaded && !error && !item ? (
            <EmptyState
              icon="search-outline"
              title="Bu soru bulunamadı"
              description="Soru öğrenme geçmişinde yer almıyor ya da kaldırılmış olabilir."
            />
          ) : null}

          {/* A pre-Phase-41 item is archived on its last outcome alone. Once it
              is solved, nothing persisted can still prove the earlier struggle,
              so it leaves the archive — said plainly rather than "not found". */}
          {item && !state ? (
            <EmptyState
              icon="checkmark-circle-outline"
              title="Bu soruyu son denemende çözdün"
              description="Bu soruyla ilgili eski kayıtların eksik olduğu için arşivde gösterilemiyor."
            />
          ) : null}

          {item && state ? (
            <>
              <View style={styles.block}>
                {context ? <Text style={styles.context}>{context}</Text> : null}
                {when ? <Text style={styles.muted}>{when}</Text> : null}
              </View>

              {!item.isQuestionAvailable ? (
                <Card variant="outlined" style={styles.unavailable}>
                  <Ionicons name="eye-off-outline" size={iconSize.md} color={colors.textTertiary} accessibilityElementsHidden />
                  <Text style={styles.body}>
                    Bu soru artık görüntülenemiyor. Silinmiş ya da erişimin kaldırılmış olabilir.
                  </Text>
                </Card>
              ) : (
                <>
                  {item.imageUrl ? (
                    <Image
                      source={{ uri: item.imageUrl }}
                      style={styles.image}
                      contentFit="contain"
                      accessible
                      accessibilityLabel="Soru görseli"
                      accessibilityIgnoresInvertColors
                    />
                  ) : null}
                  {item.description ? <Text style={styles.body}>{item.description}</Text> : null}

                  {/* Authored hints only, through the question screen's own ladder. */}
                  <QuestionHintLadder hints={item.hints} />

                  <View style={styles.block}>
                    <PrimaryButton
                      label="Tekrar Çöz"
                      onPress={retry}
                      accessibilityHint="Soruyu çözme ekranında açar"
                    />
                    <Text style={styles.muted}>{retryGuidance(item.questionKind)}</Text>
                  </View>

                  {isOpenQuestion ? (
                    <View style={styles.block}>
                      <SectionHeader title="Nasıl Geçti?" />
                      <Card variant="outlined">
                        <StudyOutcomeControls
                          item={study.item}
                          isHydrating={study.isHydrating}
                          hydrationError={study.hydrationError}
                          pendingOutcome={study.pendingOutcome}
                          onSelect={recordRetry}
                          mutationError={study.mutationError}
                          showLastOutcome={false}
                          visibleOutcomes={SELF_REPORT_OUTCOMES}
                        />
                      </Card>
                    </View>
                  ) : null}
                </>
              )}
            </>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
    alignItems: "center",
  },
  column: {
    width: "100%",
    maxWidth: contentWidth.readable,
    gap: spacing.lg,
  },
  hero: {
    gap: spacing.xs,
  },
  state: {
    ...typography.bodyStrong,
  },
  block: {
    gap: spacing.xs,
  },
  context: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  body: {
    ...typography.body,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  muted: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  image: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceMuted,
  },
  unavailable: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
}));
