import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@components/ui/Card";
import { EmptyState } from "@components/ui/EmptyState";
import { SectionHeader } from "@components/ui/SectionHeader";
import { useAuth } from "@features/authentication";
import { useLearningTrail } from "@features/learningStory/hooks/useLearningTrail";
import { ConceptPresentation } from "@features/study/services/conceptMasteryMap";
import { AnalyticsErrorBanner, AnalyticsLoading } from "@features/studentAnalytics/components/AnalyticsFeedback";
import { AnalyticsHeader } from "@features/studentAnalytics/components/AnalyticsHeader";
import { ANALYTICS_ROUTES } from "@features/studentAnalytics/routes";
import { colors } from "@theme/colors";
import { contentWidth } from "@theme/layout";
import { radius } from "@theme/radius";
import { iconSize } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

import { useStudyPlan } from "../hooks/useStudyPlan";
import { buildProgressHistory, buildProgressMap, ProgressEvent } from "../services/learningMaps";
import { shortDateLabel } from "../services/planPresentation";

export const PROGRESS_EMPTY_TITLE = "İlerlemeni göstermek için henüz kayıtlı bir adım yok.";

// Stage glyphs: one shape per rung so the ladder reads without colour.
const STAGE_ICON: Readonly<Record<ConceptPresentation, keyof typeof Ionicons.glyphMap>> = {
  needs_attention: "alert-circle-outline",
  watch: "eye-outline",
  recovering: "trending-up-outline",
  steady: "checkmark-circle-outline",
  needs_evidence: "help-circle-outline",
};

// Phase 108 — "İlerleme Haritam". Two honest views of the same evidence:
// the ladder (where each topic stands today, on Phase 70's own stages) and
// the history (dated facts, newest first: outcomes, later solves, completed
// plan days). Nothing is interpolated between rows, no curve is drawn, and
// a topic with too little evidence is counted, not placed.
export function ProgressMapScreen() {
  useThemeSubscription();
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid;
  const { items, completedDays, now, isLoading, hasLoaded, error } = useStudyPlan(uid);
  const trail = useLearningTrail(uid);

  const map = useMemo(() => buildProgressMap(items, now), [items, now]);
  const history = useMemo(
    () => buildProgressHistory({ events: trail.events, items, completedDays }),
    [trail.events, items, completedDays],
  );
  const ready = hasLoaded && !trail.isLoading;
  const isEmpty = map.totalTopics === 0 && history.isEmpty;

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.column}>
          <AnalyticsHeader
            title="İlerleme Haritam"
            subtitle="Konuların bugün nerede durduğu ve kayıtlı adımların. Yalnızca kaydedilen çözümlerden oluşur."
            backFallbackHref={ANALYTICS_ROUTES.overview}
          />

          {error ? <AnalyticsErrorBanner title="Harita şu an yüklenemedi" message={error} /> : null}
          {(isLoading && !hasLoaded) || (hasLoaded && trail.isLoading) ? <AnalyticsLoading /> : null}

          {ready && !error && isEmpty ? (
            <EmptyState
              icon="trending-up-outline"
              title={PROGRESS_EMPTY_TITLE}
              description="Soru çözdükçe konuların durumu ve kayıtlı adımların burada görünür."
            />
          ) : null}

          {ready && map.totalTopics > 0 ? (
            <View style={styles.block}>
              <SectionHeader title="Konular Bugün" />
              <Card variant="outlined" style={styles.list}>
                {map.stages.map((stage, index) => (
                  <View
                    key={stage.presentation}
                    style={[styles.stage, index > 0 ? styles.divided : null]}
                    accessible
                    accessibilityLabel={
                      stage.topics.length === 0
                        ? `${stage.label}. Bu aşamada konu yok.`
                        : `${stage.label}. ${stage.topics.length} konu: ${stage.topics.map((t) => `${t.subject} ${t.topic}`).join(", ")}.`
                    }
                  >
                    <View style={styles.stageHead}>
                      <Ionicons name={STAGE_ICON[stage.presentation]} size={iconSize.sm} color={colors.textSecondary} accessibilityElementsHidden />
                      <Text style={styles.stageLabel}>{stage.label}</Text>
                      <Text style={styles.stageCount}>{stage.topics.length}</Text>
                    </View>
                    {stage.topics.length === 0 ? (
                      <Text style={styles.quiet}>Bu aşamada konu yok</Text>
                    ) : (
                      <View style={styles.chips}>
                        {stage.topics.map((topic) => (
                          <View key={`${topic.subject}|${topic.topic}`} style={styles.chip}>
                            <Text style={styles.chipText}>
                              {topic.subject} · {topic.topic}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                ))}
                {map.unplacedCount > 0 ? (
                  <View style={[styles.stage, styles.divided]}>
                    <Text style={styles.quiet}>
                      {map.unplacedCount} konu için henüz yeterli kanıt yok; yerleştirilmedi.
                    </Text>
                  </View>
                ) : null}
              </Card>
            </View>
          ) : null}

          {ready && !history.isEmpty ? (
            <View style={styles.block}>
              <SectionHeader title="Kayıtlı Adımlar" />
              <Card variant="outlined" style={styles.list}>
                {history.events.map((event, index) => (
                  <HistoryRow key={event.id} event={event} divided={index > 0} />
                ))}
              </Card>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function historyIcon(event: ProgressEvent): keyof typeof Ionicons.glyphMap {
  if (event.kind === "plan_completed") return "calendar-outline";
  if (event.kind === "solved_later") return "refresh-circle-outline";
  if (event.outcome === "solved") return "checkmark-circle-outline";
  if (event.outcome === "struggled") return "alert-circle-outline";
  return "repeat-outline";
}

function HistoryRow({ event, divided }: { event: ProgressEvent; divided: boolean }) {
  const where = event.subject ? `${event.subject} · ${event.topic}` : null;
  return (
    <View
      style={[styles.history, divided ? styles.divided : null]}
      accessible
      accessibilityLabel={`${shortDateLabel(event.occurredAt)}. ${event.sentence}${where ? `. ${where}` : ""}.`}
    >
      <Text style={styles.historyDate}>{shortDateLabel(event.occurredAt)}</Text>
      <Ionicons name={historyIcon(event)} size={iconSize.sm} color={colors.textSecondary} accessibilityElementsHidden />
      <View style={styles.historyText}>
        <Text style={styles.historySentence}>{event.sentence}</Text>
        {where ? <Text style={styles.historyWhere}>{where}</Text> : null}
      </View>
    </View>
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
  block: {
    gap: spacing.sm,
  },
  list: {
    paddingVertical: 0,
  },
  divided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  stage: {
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  stageHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  stageLabel: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
  stageCount: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xxs,
  },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  chipText: {
    ...typography.caption,
    color: colors.textPrimary,
  },
  quiet: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  history: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  historyDate: {
    ...typography.caption,
    color: colors.textTertiary,
    width: 48,
  },
  historyText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  historySentence: {
    ...typography.body,
    color: colors.textPrimary,
  },
  historyWhere: {
    ...typography.caption,
    color: colors.textSecondary,
  },
}));
