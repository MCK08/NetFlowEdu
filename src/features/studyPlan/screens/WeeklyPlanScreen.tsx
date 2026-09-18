import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@components/ui/Card";
import { SectionHeader } from "@components/ui/SectionHeader";
import { useAuth } from "@features/authentication";
import { getRecentStudyDays, StudyDay } from "@features/study/services/studyService";
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

import { PlanStepRow } from "../components/PlanStepRow";
import { useStudyPlan } from "../hooks/useStudyPlan";
import { PLAN_ROUTES, planStepRoute } from "../routes";
import { shortDateLabel, WEEKDAY_SHORT } from "../services/planPresentation";
import { buildWeekView, FUTURE_DAY_PLACEHOLDER, pastDaySentence, WeekDayEntry } from "../services/weeklyPlan";

// Phase 108 — "Haftalık Plan": a Monday-first strip of the current week,
// then one card per day. Past days show what was recorded; today shows the
// live plan; future days carry a single honest placeholder, because the
// plan for a day is built on that morning's learning state.
export function WeeklyPlanScreen() {
  useThemeSubscription();
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid;
  const { plan, completedDays, now, isLoading, hasLoaded, error } = useStudyPlan(uid);
  const [studyDays, setStudyDays] = useState<StudyDay[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!uid) {
      setStudyDays([]);
      return;
    }
    getRecentStudyDays(uid)
      .then((days) => {
        if (!cancelled) setStudyDays(days);
      })
      .catch(() => {
        // The week still renders from the plan-local records; the study-day
        // sentence simply falls back to "Kayıtlı çalışma yok".
        if (!cancelled) setStudyDays([]);
      });
    return () => {
      cancelled = true;
    };
  }, [uid, now]);

  const week = useMemo(() => buildWeekView({ now, completedDays, studyDays }), [now, completedDays, studyDays]);
  const openStep = useCallback((stepId: string) => router.push(planStepRoute(stepId) as never), []);

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.column}>
          <AnalyticsHeader
            title="Haftalık Plan"
            subtitle={
              hasLoaded
                ? `Bu hafta ${week.completedCount} gün planını tamamladın, ${week.activeCount} gün çalışma kaydedildi.`
                : null
            }
            backFallbackHref={PLAN_ROUTES.home}
          />

          {error ? <AnalyticsErrorBanner title="Hafta şu an yüklenemedi" message={error} /> : null}
          {isLoading && !hasLoaded ? <AnalyticsLoading /> : null}

          {hasLoaded ? (
            <>
              <View style={styles.strip} accessibilityRole="list">
                {week.days.map((day) => (
                  <WeekDayChip key={day.dayKey} day={day} />
                ))}
              </View>

              {week.days.map((day) => (
                <View key={day.dayKey} style={styles.block}>
                  <SectionHeader
                    title={day.kind === "today" ? "Bugün" : `${WEEKDAY_SHORT[new Date(day.startsAt).getDay()]} · ${shortDateLabel(day.startsAt)}`}
                  />
                  {day.kind === "today" ? (
                    plan.steps.length > 0 ? (
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
                    ) : (
                      <Card variant="outlined">
                        <Text style={styles.quiet}>Bugün için planlanacak bir adım yok.</Text>
                      </Card>
                    )
                  ) : day.kind === "past" ? (
                    <Card variant="outlined" style={styles.pastRow}>
                      <Ionicons
                        name={day.completedPlan ? "checkmark-circle" : day.studyDay?.reviewCount ? "ellipse" : "ellipse-outline"}
                        size={iconSize.sm}
                        color={day.completedPlan ? colors.success : colors.textTertiary}
                        accessibilityElementsHidden
                      />
                      <Text style={styles.pastText}>{pastDaySentence(day)}</Text>
                    </Card>
                  ) : (
                    <Card variant="outlined">
                      <Text style={styles.quiet}>{FUTURE_DAY_PLACEHOLDER}</Text>
                    </Card>
                  )}
                </View>
              ))}
            </>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function WeekDayChip({ day }: { day: WeekDayEntry }) {
  const weekday = WEEKDAY_SHORT[new Date(day.startsAt).getDay()];
  const dateLabel = shortDateLabel(day.startsAt);
  const status =
    day.kind === "future"
      ? "Henüz planlanmadı"
      : day.kind === "today"
        ? "Bugün"
        : day.completedPlan
          ? "Plan tamamlandı"
          : day.studyDay?.reviewCount
            ? "Çalışma kaydedildi"
            : "Kayıt yok";
  return (
    <View
      style={[styles.chip, day.kind === "today" ? styles.chipToday : null, day.kind === "future" ? styles.chipFuture : null]}
      accessible
      accessibilityLabel={`${weekday} ${dateLabel}. ${status}.`}
    >
      <Text style={[styles.chipWeekday, day.kind === "today" ? styles.chipTextToday : null]}>{weekday}</Text>
      <Text style={[styles.chipDate, day.kind === "today" ? styles.chipTextToday : null]}>{new Date(day.startsAt).getDate()}</Text>
      <View style={styles.chipMark}>
        {day.kind === "past" && day.completedPlan ? (
          <Ionicons name="checkmark" size={iconSize.xs} color={colors.success} accessibilityElementsHidden />
        ) : day.kind === "past" && day.studyDay?.reviewCount ? (
          <View style={styles.chipDot} />
        ) : null}
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
  strip: {
    flexDirection: "row",
    gap: spacing.xxs,
  },
  chip: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
    gap: 2,
  },
  chipToday: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipFuture: {
    opacity: 0.6,
  },
  chipWeekday: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  chipDate: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  chipTextToday: {
    color: colors.textInverse,
  },
  chipMark: {
    height: iconSize.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  chipDot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.textTertiary,
  },
  list: {
    paddingVertical: 0,
  },
  pastRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  pastText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
  quiet: {
    ...typography.body,
    color: colors.textSecondary,
  },
}));
