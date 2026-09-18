import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo } from "react";
import { ScrollView, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@components/ui/Card";
import { EmptyState } from "@components/ui/EmptyState";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { SectionHeader } from "@components/ui/SectionHeader";
import { StatusLabel } from "@components/ui/StatusLabel";
import { ROUTES } from "@constants/routes";
import { useAuth } from "@features/authentication";
import { useLearningTrail } from "@features/learningStory/hooks/useLearningTrail";
import { trailStepLabel } from "@features/learningStory/services/learningTrail";
import type { StudyOutcome } from "@features/study/domain/studyTypes";
import {
  conceptReviewNote,
  conceptStateLabel,
  conceptSupportingFact,
} from "@features/study/services/conceptMasteryMap";
import { colors } from "@theme/colors";
import { contentWidth } from "@theme/layout";
import { iconSize, stackAtFontScale } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

import { AnalyticsErrorBanner, AnalyticsLoading } from "../components/AnalyticsFeedback";
import { AnalyticsHeader } from "../components/AnalyticsHeader";
import { AnalyticsNavRow } from "../components/AnalyticsNavRow";
import { StatTile } from "../components/StatTile";
import { toneTextColor } from "../components/toneColor";
import { useStudentAnalytics } from "../hooks/useStudentAnalytics";
import { ANALYTICS_ROUTES } from "../routes";
import {
  CONCEPT_ICON,
  CONCEPT_TONE,
  lastStudiedLabel,
  OUTCOME_ICON,
  successRateSentence,
  successRateValue,
  topicTimelineSentence,
} from "../services/analyticsPresentation";
import { buildTopicDetail, buildTopicTimeline } from "../services/studentAnalytics";

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

// Resolved per render (the Phase 52 rule): each outcome's mark, with the
// words beneath it carrying the meaning — the colour only assists.
function outcomeColor(outcome: StudyOutcome): string {
  if (outcome === "solved") return colors.success;
  if (outcome === "struggled") return colors.danger;
  return colors.textSecondary;
}

// Phase 107 — "Konu Detayı".
//
// Leads with the topic, not a score. The verdict and its sentences are Öğrenme
// Haritam's own (conceptMasteryMap), so the student never meets two readings of
// one topic. The only chronology is the product's real learning events, drawn
// as they happened; with too few of them it says so rather than drawing a line.
export function TopicDetailScreen() {
  useThemeSubscription();
  const params = useLocalSearchParams<{ subject?: string | string[]; topic?: string | string[] }>();
  const subject = firstParam(params.subject);
  const topic = firstParam(params.topic);

  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid;
  const { items, loadedAt, isLoading, hasLoaded, error } = useStudentAnalytics(uid);
  const { events } = useLearningTrail(uid);
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= stackAtFontScale;

  const now = loadedAt;
  const detail = useMemo(() => buildTopicDetail(items, subject, topic, now), [items, subject, topic, now]);
  const timeline = useMemo(() => buildTopicTimeline(events, subject, topic), [events, subject, topic]);

  const openArchive = useCallback(() => {
    router.push({ pathname: ANALYTICS_ROUTES.archive, params: { subject, topic } } as never);
  }, [subject, topic]);

  // The canonical practice entry, labelled for what it is. There is no
  // topic-targeted session to route to, and a "Denklemleri Çalış" button that
  // opened general practice would be a promise it cannot keep — the same rule
  // Öğrenme Haritam states for its own button.
  const continueStudying = useCallback(() => {
    router.push(ROUTES.studentAdaptiveSession as never);
  }, []);

  const node = detail?.node ?? null;
  const verdict = node ? conceptStateLabel(node) : null;
  const verdictTone = node ? CONCEPT_TONE[node.presentation] : null;
  const reviewNote = node ? conceptReviewNote(node) : null;
  const studied = detail ? lastStudiedLabel(detail.lastReviewedAt, now) : null;

  const archiveParts: string[] = [];
  if (detail && detail.archivePendingCount > 0) archiveParts.push(`${detail.archivePendingCount} tekrar bekliyor`);
  if (detail && detail.archiveSolvedLaterCount > 0) {
    archiveParts.push(`${detail.archiveSolvedLaterCount} sonradan çözüldü`);
  }
  const archiveDescription = archiveParts.length > 0 ? archiveParts.join(" · ") : "Bu konuda zorlandığın bir soru yok";

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.column}>
          <View style={styles.hero}>
            <AnalyticsHeader
              eyebrow={subject || null}
              title={topic || "Konu"}
              backFallbackHref={ANALYTICS_ROUTES.subjects}
            />
            {node && verdict && verdictTone ? (
              <StatusLabel
                icon={CONCEPT_ICON[node.presentation]}
                tone={verdictTone}
                size={iconSize.sm}
                textStyle={[styles.verdict, { color: toneTextColor(verdictTone) }]}
              >
                {verdict}
              </StatusLabel>
            ) : null}
          </View>

          {error ? <AnalyticsErrorBanner title="Konu şu an yüklenemedi" message={error} /> : null}
          {isLoading && !hasLoaded ? <AnalyticsLoading /> : null}

          {hasLoaded && !error && !detail ? (
            <EmptyState
              icon="book-outline"
              title="Bu konuda kayıtlı çalışman bulunamadı"
              description="Bu konudan bir soru çözdüğünde ayrıntıları burada görünür."
            />
          ) : null}

          {detail ? (
            <>
              <View style={stacked ? styles.tilesStacked : styles.tiles}>
                <StatTile
                  stacked={stacked}
                  value={String(detail.questionCount)}
                  label="Soru"
                  accessibilityLabel={`Bu konuda ${detail.questionCount} soru üzerinde çalıştın`}
                />
                <StatTile
                  stacked={stacked}
                  value={detail.knownOutcomeCount > 0 ? String(detail.knownOutcomeCount) : "—"}
                  label="Kayıtlı deneme"
                  accessibilityLabel={
                    detail.knownOutcomeCount > 0
                      ? `${detail.knownOutcomeCount} kayıtlı deneme`
                      : "Kayıtlı deneme sayısı için henüz yeterli veri yok"
                  }
                />
                <StatTile
                  stacked={stacked}
                  value={successRateValue(detail.successRatePercent)}
                  label="Çözme oranı"
                  accessibilityLabel={successRateSentence(detail.successRatePercent, detail.knownOutcomeCount)}
                />
              </View>

              {node ? (
                <View style={styles.block}>
                  <SectionHeader title="Durum" />
                  <Card variant="outlined" style={styles.card}>
                    <Text style={styles.body}>{conceptSupportingFact(node)}</Text>
                    {reviewNote ? (
                      <StatusLabel
                        icon="time-outline"
                        tone="primary"
                        textStyle={[styles.caption, { color: toneTextColor("primary") }]}
                      >
                        {reviewNote}
                      </StatusLabel>
                    ) : null}
                    {studied ? <Text style={styles.muted}>{studied}</Text> : null}
                  </Card>
                </View>
              ) : null}

              <View style={styles.block}>
                <SectionHeader title="Son Denemelerin" />
                <Card variant="outlined" style={styles.card}>
                  {timeline.isSufficient ? (
                    <>
                      <Text style={styles.muted}>Eskiden yeniye</Text>
                      {/* One accessible node: the sentence IS the chart. */}
                      <View
                        style={stacked ? styles.stripStacked : styles.strip}
                        accessible
                        accessibilityLabel={topicTimelineSentence(timeline)}
                      >
                        {timeline.steps.map((step, index) => (
                          <View key={`${index}-${step}`} style={stacked ? styles.stepStacked : styles.step}>
                            <Ionicons
                              name={OUTCOME_ICON[step]}
                              size={iconSize.md}
                              color={outcomeColor(step)}
                              accessibilityElementsHidden
                            />
                            <Text style={styles.stepLabel}>{trailStepLabel(step)}</Text>
                          </View>
                        ))}
                      </View>
                    </>
                  ) : (
                    <Text style={styles.body}>{topicTimelineSentence(timeline)}</Text>
                  )}
                </Card>
              </View>

              <AnalyticsNavRow
                icon="archive-outline"
                title="Bu Konuda Çözemediğim Sorular"
                description={archiveDescription}
                onPress={openArchive}
                accessibilityHint="Bu konudaki arşivlenmiş soruları açar"
              />

              <PrimaryButton
                label="Çalışmaya Devam Et"
                onPress={continueStudying}
                accessibilityHint="Önerilen çalışma akışını açar"
              />
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
    gap: spacing.xl,
  },
  hero: {
    gap: spacing.xs,
  },
  verdict: {
    ...typography.bodyStrong,
  },
  tiles: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.sm,
  },
  tilesStacked: {
    gap: spacing.sm,
  },
  block: {
    gap: spacing.xs,
  },
  card: {
    gap: spacing.xs,
  },
  body: {
    ...typography.body,
    color: colors.textPrimary,
  },
  caption: {
    ...typography.caption,
    fontWeight: "600",
  },
  muted: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  strip: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  stripStacked: {
    gap: spacing.xs,
  },
  step: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: spacing.xxs,
  },
  stepStacked: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  stepLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
  },
}));
