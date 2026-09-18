import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@components/ui/Card";
import { EmptyState } from "@components/ui/EmptyState";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { SectionHeader } from "@components/ui/SectionHeader";
import { useAuth } from "@features/authentication";
import { AnalyticsErrorBanner, AnalyticsLoading } from "@features/studentAnalytics/components/AnalyticsFeedback";
import { AnalyticsHeader } from "@features/studentAnalytics/components/AnalyticsHeader";
import { AnalyticsNavRow } from "@features/studentAnalytics/components/AnalyticsNavRow";
import { ROUTES } from "@constants/routes";
import { colors } from "@theme/colors";
import { contentWidth } from "@theme/layout";
import { radius } from "@theme/radius";
import { iconSize } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

import { PlanStepRow } from "../components/PlanStepRow";
import { useStudyPlan } from "../hooks/useStudyPlan";
import { PLAN_ROUTES, planStepRoute } from "../routes";
import { nextPendingStep, planCompletionSentence } from "../services/dailyPlan";
import { PLAN_INTRO_ASSIGNED, PLAN_INTRO_EMPTY, PLAN_INTRO_EVIDENCE } from "../services/planPresentation";

// Phase 108 — "Çalışma Planım", the day's home.
//
// One loud card (the day's plan: steps, progress, ONE button), the steps as
// a grouped list, then the quiet ways into the week, the maps and the
// preferences. The intro sentence is chosen from what the plan actually
// rests on: it claims "öğrenme geçmişine göre" only when a step really does.
export function PlanHomeScreen() {
  useThemeSubscription();
  const { firebaseUser } = useAuth();
  const { plan, isLoading, hasLoaded, error } = useStudyPlan(firebaseUser?.uid);

  const next = nextPendingStep(plan);
  const hasSteps = plan.steps.length > 0;
  const progressPercent: `${number}%` = `${hasSteps ? Math.round((plan.completedCount / plan.steps.length) * 100) : 0}%`;
  const intro = !hasLoaded ? null : !hasSteps ? PLAN_INTRO_EMPTY : plan.isEvidenceBased ? PLAN_INTRO_EVIDENCE : PLAN_INTRO_ASSIGNED;

  const openStep = useCallback((stepId: string) => router.push(planStepRoute(stepId) as never), []);
  const startLearning = useCallback(() => {
    if (next) router.push(planStepRoute(next.id) as never);
  }, [next]);
  const goToStudy = useCallback(() => router.navigate(ROUTES.studentStudy as never), []);

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.column}>
          <AnalyticsHeader title="Çalışma Planım" subtitle={intro} backFallbackHref={ROUTES.studentStudy} />

          {error ? <AnalyticsErrorBanner title="Planın şu an yüklenemedi" message={error} /> : null}
          {isLoading && !hasLoaded ? <AnalyticsLoading /> : null}

          {hasLoaded && !error && !hasSteps ? (
            <View style={styles.block}>
              <EmptyState
                icon="calendar-outline"
                title="Bugün için planlanacak bir adım yok"
                description="Soru çözdükçe zorlandığın konular, tekrar zamanı gelen sorular ve atanan çalışmalar burada bir plana dönüşür."
              />
              <PrimaryButton label="Çalışmaya Başla" onPress={goToStudy} />
            </View>
          ) : null}

          {hasLoaded && hasSteps ? (
            <>
              <View
                style={styles.focus}
                accessible
                accessibilityLabel={
                  plan.isComplete
                    ? `Bugünkü plan tamamlandı. ${planCompletionSentence(plan)}`
                    : `Bugünün planı hazır. ${plan.steps.length} adım, ${plan.completedCount} tamamlandı.`
                }
              >
                <View style={styles.focusRow}>
                  <View style={styles.focusIcon}>
                    <Ionicons
                      name={plan.isComplete ? "checkmark-circle" : "calendar-outline"}
                      size={iconSize.md}
                      color={colors.primary}
                      accessibilityElementsHidden
                    />
                  </View>
                  <View style={styles.focusText}>
                    <Text style={styles.focusTitle}>{plan.isComplete ? "Bugünkü plan tamamlandı" : "Bugünün Planı Hazır"}</Text>
                    <Text style={styles.focusDetail}>
                      {plan.isComplete ? planCompletionSentence(plan) : `${plan.steps.length} adım seni bekliyor`}
                    </Text>
                  </View>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: progressPercent }]} />
                </View>
                <Text style={styles.progressCaption}>
                  {plan.completedCount} / {plan.steps.length} tamamlandı
                  {plan.skippedCount > 0 ? ` · ${plan.skippedCount} atlandı` : ""}
                </Text>
              </View>

              {next ? (
                <PrimaryButton
                  label="Öğrenmeye Başla"
                  onPress={startLearning}
                  accessibilityHint="Sıradaki adımı açar"
                />
              ) : null}

              <View style={styles.block}>
                <SectionHeader title="Bugünün Adımları" />
                <Card variant="outlined" style={styles.list}>
                  {plan.steps.map((step, index) => (
                    <PlanStepRow
                      key={step.id}
                      step={step}
                      index={index}
                      total={plan.steps.length}
                      onPress={openStep}
                      divided={index > 0}
                    />
                  ))}
                </Card>
              </View>
            </>
          ) : null}

          {hasLoaded ? (
            <View style={styles.block}>
              <SectionHeader title="Planın Etrafında" />
              <AnalyticsNavRow
                icon="calendar-outline"
                title="Haftalık Plan"
                description="Tamamlanan günler ve bugün"
                onPress={() => router.push(PLAN_ROUTES.week as never)}
                accessibilityHint="Haftalık görünümü açar"
              />
              <AnalyticsNavRow
                icon="map-outline"
                title="Eksik Haritam"
                description="Tekrar bekleyen soruların ders ve konu dağılımı"
                onPress={() => router.push(PLAN_ROUTES.gaps as never)}
                accessibilityHint="Eksik haritasını açar"
              />
              <AnalyticsNavRow
                icon="trending-up-outline"
                title="İlerleme Haritam"
                description="Konuların bugün nerede durduğu ve kayıtlı adımlar"
                onPress={() => router.push(PLAN_ROUTES.progress as never)}
                accessibilityHint="İlerleme haritasını açar"
              />
              <AnalyticsNavRow
                icon="options-outline"
                title="Planını Özelleştir"
                description="Günlük hedefin, adım sayın ve odak derslerin"
                onPress={() => router.push(PLAN_ROUTES.settings as never)}
                accessibilityHint="Plan ayarlarını açar"
              />
            </View>
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
  block: {
    gap: spacing.sm,
  },
  focus: {
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.xxl,
    padding: spacing.md,
    gap: spacing.sm,
  },
  focusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  focusIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  focusText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  focusTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  focusDetail: {
    ...typography.body,
    color: colors.textSecondary,
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  progressCaption: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  list: {
    paddingVertical: 0,
  },
}));
