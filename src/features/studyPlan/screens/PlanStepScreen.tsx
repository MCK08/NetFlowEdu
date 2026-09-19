import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@components/ui/Card";
import { EmptyState } from "@components/ui/EmptyState";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { StatusLabel } from "@components/ui/StatusLabel";
import { ROUTES } from "@constants/routes";
import { useAuth } from "@features/authentication";
import { AnalyticsErrorBanner, AnalyticsLoading } from "@features/studentAnalytics/components/AnalyticsFeedback";
import { AnalyticsHeader } from "@features/studentAnalytics/components/AnalyticsHeader";
import { colors } from "@theme/colors";
import { contentWidth } from "@theme/layout";
import { radius } from "@theme/radius";
import { iconSize } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

import { usePlanStepNavigation } from "../hooks/usePlanStepNavigation";
import { useStudyPlan } from "../hooks/useStudyPlan";
import { planStepRoute } from "../routes";
import { pendingRevisitCount, planCompletionSentence, stepCompletionFacts } from "../services/dailyPlan";
import {
  STEP_KIND_ICON,
  STEP_KIND_LABEL,
  STEP_STATE_ICON,
  STEP_STATE_LABEL,
  STEP_STATE_TONE,
  stepContents,
  stepStartLabel,
  stepTitle,
  stepWhy,
} from "../services/planPresentation";

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

// Phase 108 — "Bugünün Adımı": one step, focused.
//
// Step n / total, subject — topic, what the step contains (facts), why it is
// here (one calm sentence, never a warning), one primary button that opens
// the real surface, and a quiet skip. When recorded evidence says the step
// is done, the same screen becomes the restrained completion state: the
// facts that happened, "Sonraki Adıma Geç", "Planı Görüntüle". Nothing here
// records an outcome; only the study surfaces do.
export function PlanStepScreen() {
  useThemeSubscription();
  const params = useLocalSearchParams<{ stepId?: string | string[] }>();
  const stepId = firstParam(params.stepId);
  const { firebaseUser } = useAuth();
  const { plan, items, isLoading, hasLoaded, error, skipStep, unskipStep } = useStudyPlan(firebaseUser?.uid);
  const startStep = usePlanStepNavigation();

  const index = plan.steps.findIndex((step) => step.id === stepId);
  const step = index >= 0 ? plan.steps[index] : null;
  const nextStep = useMemo(
    () => plan.steps.find((candidate, position) => position > index && candidate.state === "pending") ?? null,
    [plan.steps, index],
  );
  const pendingRevisit = step ? pendingRevisitCount(step, items) : 0;

  // Phase 109 — "the plan" the student returns to is Çalış itself, where
  // today's steps are inline; PlanHome remains only as a deep-link target.
  const goToPlan = useCallback(() => router.navigate(ROUTES.studentStudy as never), []);
  const goToNext = useCallback(() => {
    if (nextStep) router.replace(planStepRoute(nextStep.id) as never);
    else goToPlan();
  }, [nextStep, goToPlan]);

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.column}>
          <AnalyticsHeader
            title={step && step.state === "completed" ? "Adım tamamlandı" : "Bugünün Adımı"}
            eyebrow={step ? `Adım ${index + 1} / ${plan.steps.length}` : null}
            backFallbackHref={ROUTES.studentStudy}
          />

          {error ? <AnalyticsErrorBanner title="Adım şu an yüklenemedi" message={error} /> : null}
          {isLoading && !hasLoaded ? <AnalyticsLoading /> : null}

          {hasLoaded && !error && !step ? (
            <View style={styles.block}>
              <EmptyState
                icon="calendar-outline"
                title="Bu adım artık planda değil"
                description="Plan öğrenme durumuna göre yenilendi. Güncel adımları planında görebilirsin."
              />
              <PrimaryButton label="Planı Görüntüle" onPress={goToPlan} />
            </View>
          ) : null}

          {step ? (
            <>
              <View style={styles.hero}>
                <View style={styles.heroIcon}>
                  <Ionicons name={STEP_KIND_ICON[step.kind]} size={iconSize.md} color={colors.primary} accessibilityElementsHidden />
                </View>
                <View style={styles.heroText}>
                  <Text style={styles.heroKind}>{STEP_KIND_LABEL[step.kind]}</Text>
                  <Text style={styles.heroTitle}>{stepTitle(step)}</Text>
                  <Text style={styles.heroWorkload}>{step.workload}</Text>
                </View>
              </View>

              {step.state === "completed" ? (
                <>
                  <Card variant="outlined" style={styles.card}>
                    <Text style={styles.cardTitle}>Bugünkü ilerlemen</Text>
                    {stepCompletionFacts(step).map((fact) => (
                      <StatusLabel key={fact} icon="checkmark-circle" tone="success" textStyle={styles.fact}>
                        {fact}
                      </StatusLabel>
                    ))}
                    {plan.isComplete ? <Text style={styles.planDone}>{planCompletionSentence(plan)}</Text> : null}
                  </Card>
                  <PrimaryButton
                    label={nextStep ? "Sonraki Adıma Geç" : "Planı Görüntüle"}
                    onPress={nextStep ? goToNext : goToPlan}
                  />
                  {nextStep ? <PrimaryButton label="Planı Görüntüle" onPress={goToPlan} variant="secondary" /> : null}
                </>
              ) : (
                <>
                  <Card variant="outlined" style={styles.card}>
                    <Text style={styles.cardTitle}>Bu adımda</Text>
                    {stepContents(step, pendingRevisit).map((line) => (
                      <View key={line} style={styles.bullet}>
                        <View style={styles.dot} />
                        <Text style={styles.bulletText}>{line}</Text>
                      </View>
                    ))}
                    {step.state === "skipped" ? (
                      <StatusLabel icon={STEP_STATE_ICON.skipped} tone={STEP_STATE_TONE.skipped} textStyle={styles.fact}>
                        {STEP_STATE_LABEL.skipped}
                      </StatusLabel>
                    ) : null}
                  </Card>

                  <PrimaryButton
                    label={stepStartLabel(step)}
                    onPress={() => startStep(step)}
                    accessibilityHint="Bu adımın çalışmasını açar"
                  />
                  {step.state === "skipped" ? (
                    <PrimaryButton label="Adımı Geri Al" onPress={() => unskipStep(step.id)} variant="secondary" />
                  ) : (
                    <PrimaryButton
                      label="Bu Adımı Atla"
                      onPress={() => skipStep(step.id)}
                      variant="secondary"
                      accessibilityHint="Adımı bugün için atlar; öğrenme kayıtların değişmez"
                    />
                  )}

                  <Card variant="outlined" style={styles.why}>
                    <View style={styles.whyTitleRow}>
                      <Ionicons name="information-circle-outline" size={iconSize.sm} color={colors.textTertiary} accessibilityElementsHidden />
                      <Text style={styles.whyTitle}>Neden bu adım?</Text>
                    </View>
                    <Text style={styles.whyText}>{stepWhy(step)}</Text>
                    <Text style={styles.whyReason}>{step.reason}</Text>
                  </Card>
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
    gap: spacing.md,
  },
  block: {
    gap: spacing.sm,
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.xxl,
    backgroundColor: colors.primaryMuted,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  heroText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  heroKind: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.primary,
  },
  heroTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  heroWorkload: {
    ...typography.body,
    color: colors.textSecondary,
  },
  card: {
    gap: spacing.xs,
  },
  cardTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  bullet: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    marginTop: 7,
    backgroundColor: colors.primary,
  },
  bulletText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
  fact: {
    ...typography.body,
    color: colors.textPrimary,
  },
  planDone: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  why: {
    gap: spacing.xxs,
  },
  whyTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  whyTitle: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.textTertiary,
    textTransform: "uppercase",
  },
  whyText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  whyReason: {
    ...typography.caption,
    color: colors.textSecondary,
  },
}));
