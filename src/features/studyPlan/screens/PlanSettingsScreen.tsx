import { Ionicons } from "@expo/vector-icons";
import { useCallback, useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { Card } from "@components/ui/Card";
import { SectionHeader } from "@components/ui/SectionHeader";
import { useAuth } from "@features/authentication";
import { DailyGoalEditor } from "@features/study/components/DailyGoalEditor";
import { AnalyticsErrorBanner, AnalyticsLoading } from "@features/studentAnalytics/components/AnalyticsFeedback";
import { AnalyticsHeader } from "@features/studentAnalytics/components/AnalyticsHeader";
import { SegmentedPills } from "@features/studentAnalytics/components/SegmentedPills";
import { colors } from "@theme/colors";
import { contentWidth } from "@theme/layout";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

import { useStudyPlan } from "../hooks/useStudyPlan";
import { PLAN_ROUTES } from "../routes";
import { clampPlanSteps, MAX_PLAN_STEPS, MIN_PLAN_STEPS } from "../services/dailyPlan";

const PLAN_SIZE_OPTIONS = ["3", "4", "5"] as const;
type PlanSizeOption = (typeof PLAN_SIZE_OPTIONS)[number];

// Phase 108 — "Planını Özelleştir". Three honest preferences and nothing
// more: the daily goal (the same server-validated editor the Hub uses), how
// many steps a day, and which subjects to see first. The screen says plainly
// what a preference does and does not do: it orders the plan, it never
// overrides what the scheduler says is due or what the evidence says needs
// attention.
export function PlanSettingsScreen() {
  useThemeSubscription();
  const { firebaseUser } = useAuth();
  const { items, summary, preferences, isLoading, hasLoaded, error, setPreferences } = useStudyPlan(firebaseUser?.uid);

  const subjects = useMemo(() => {
    const seen = new Set<string>();
    for (const item of items) {
      const subject = item.subject?.trim();
      if (subject) seen.add(subject);
    }
    return Array.from(seen).sort((a, b) => a.localeCompare(b, "tr"));
  }, [items]);

  const planSize = String(clampPlanSteps(preferences.maxSteps)) as PlanSizeOption;
  const setPlanSize = useCallback(
    (value: PlanSizeOption) => setPreferences({ ...preferences, maxSteps: clampPlanSteps(Number(value)) }),
    [preferences, setPreferences],
  );
  const toggleSubject = useCallback(
    (subject: string) => {
      const focused = preferences.focusSubjects.includes(subject)
        ? preferences.focusSubjects.filter((entry) => entry !== subject)
        : [...preferences.focusSubjects, subject];
      setPreferences({ ...preferences, focusSubjects: focused });
    },
    [preferences, setPreferences],
  );

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <AnalyticsHeader
            title="Planını Özelleştir"
            subtitle="Tercihlerin planın sırasını belirler; tekrar zamanı gelen sorular ve zorlandığın konular her zaman önce gelir."
            backFallbackHref={PLAN_ROUTES.home}
          />

          {error ? <AnalyticsErrorBanner title="Ayarlar şu an yüklenemedi" message={error} /> : null}
          {isLoading && !hasLoaded ? <AnalyticsLoading /> : null}

          {hasLoaded ? (
            <>
              <View style={styles.block}>
                <SectionHeader title="Hedef" />
                <Card variant="outlined" style={styles.goalCard}>
                  <View style={styles.goalRow}>
                    <Text style={styles.goalLabel}>Günlük tekrar hedefi</Text>
                    <Text style={styles.goalValue}>{summary.dailyGoal} soru</Text>
                  </View>
                  <DailyGoalEditor currentGoal={summary.dailyGoal} />
                </Card>
              </View>

              <View style={styles.block}>
                <SectionHeader title="Plan Boyutu" />
                <Card variant="outlined" style={styles.card}>
                  <Text style={styles.help}>
                    Bir günde en fazla kaç adım görmek istersin? Plan {MIN_PLAN_STEPS} ile {MAX_PLAN_STEPS} adım arasında kalır.
                  </Text>
                  <SegmentedPills
                    options={PLAN_SIZE_OPTIONS}
                    value={planSize}
                    onChange={setPlanSize}
                    labelFor={(value) => `${value} adım`}
                    accessibilityLabel="Günlük adım sayısı"
                  />
                </Card>
              </View>

              <View style={styles.block}>
                <SectionHeader title="Odak Alanları" />
                <Card variant="outlined" style={styles.card}>
                  <Text style={styles.help}>
                    Seçtiğin dersler planda öne alınır. Seçim yapmazsan sıralama yalnızca öğrenme durumuna göre olur.
                  </Text>
                  {subjects.length === 0 ? (
                    <Text style={styles.quiet}>Odak seçmek için önce birkaç soru çözmen gerekiyor.</Text>
                  ) : (
                    subjects.map((subject) => {
                      const checked = preferences.focusSubjects.includes(subject);
                      return (
                        <AnimatedPressable
                          key={subject}
                          onPress={() => toggleSubject(subject)}
                          style={styles.subjectRow}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked }}
                          accessibilityLabel={subject}
                          accessibilityHint={checked ? "Odak alanından çıkarır" : "Odak alanı olarak ekler"}
                        >
                          <Ionicons
                            name={checked ? "checkbox" : "square-outline"}
                            size={iconSize.md}
                            color={checked ? colors.primary : colors.textTertiary}
                            accessibilityElementsHidden
                          />
                          <Text style={styles.subjectText}>{subject}</Text>
                        </AnimatedPressable>
                      );
                    })
                  )}
                </Card>
              </View>
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
  block: {
    gap: spacing.sm,
  },
  card: {
    gap: spacing.sm,
  },
  goalCard: {
    gap: spacing.xs,
  },
  goalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  goalLabel: {
    ...typography.body,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  goalValue: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  help: {
    ...typography.body,
    color: colors.textSecondary,
  },
  quiet: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  subjectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
  },
  subjectText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
}));
