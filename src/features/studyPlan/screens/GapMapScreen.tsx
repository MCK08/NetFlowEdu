import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { Card } from "@components/ui/Card";
import { EmptyState } from "@components/ui/EmptyState";
import { SectionHeader } from "@components/ui/SectionHeader";
import { useAuth } from "@features/authentication";
import { AnalyticsErrorBanner, AnalyticsLoading } from "@features/studentAnalytics/components/AnalyticsFeedback";
import { AnalyticsHeader } from "@features/studentAnalytics/components/AnalyticsHeader";
import { StatTile } from "@features/studentAnalytics/components/StatTile";
import { useStudentAnalytics } from "@features/studentAnalytics/hooks/useStudentAnalytics";
import { ANALYTICS_ROUTES } from "@features/studentAnalytics/routes";
import { colors } from "@theme/colors";
import { contentWidth } from "@theme/layout";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

import { buildGapMap, gapCountLabel, GapTopic } from "../services/learningMaps";

export const GAP_MAP_EMPTY_TITLE = "Şu anda tekrar bekleyen bir sorun yok.";

// Phase 108 — "Eksik Haritam": subject → topic → how many archived questions
// still wait. Built only from the Phase 107 archive (the student's own
// unresolved questions), so every row is a fact the student can open: the
// tap lands in the topic-scoped "Çözemediğim Sorular" list, never a second
// question list of its own.
export function GapMapScreen() {
  useThemeSubscription();
  const { firebaseUser } = useAuth();
  const { items, loadedAt, isLoading, hasLoaded, error } = useStudentAnalytics(firebaseUser?.uid);
  const map = useMemo(() => buildGapMap(items, loadedAt), [items, loadedAt]);

  const openTopic = useCallback((gap: GapTopic) => {
    router.push(
      `${ANALYTICS_ROUTES.archive}?subject=${encodeURIComponent(gap.subject)}&topic=${encodeURIComponent(gap.topic)}` as never,
    );
  }, []);

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.column}>
          <AnalyticsHeader
            title="Eksik Haritam"
            subtitle="Çözemediğin soruların ders ve konu dağılımı. Bir konuya dokununca o konudaki soruları görürsün."
            backFallbackHref={ANALYTICS_ROUTES.overview}
          />

          {error ? <AnalyticsErrorBanner title="Harita şu an yüklenemedi" message={error} /> : null}
          {isLoading && !hasLoaded ? <AnalyticsLoading /> : null}

          {hasLoaded && !error && map.isEmpty ? (
            <EmptyState
              icon="map-outline"
              title={GAP_MAP_EMPTY_TITLE}
              description="Çözemediğin bir soru olduğunda burada dersine ve konusuna göre yerini alır."
            />
          ) : null}

          {hasLoaded && !map.isEmpty ? (
            <>
              <View style={styles.stats}>
                <StatTile
                  value={String(map.pendingTotal)}
                  label="tekrar bekliyor"
                  accessibilityLabel={`${map.pendingTotal} soru tekrar bekliyor`}
                  stacked={false}
                />
                <StatTile
                  value={String(map.solvedLaterTotal)}
                  label="sonradan çözüldü"
                  accessibilityLabel={`${map.solvedLaterTotal} soru sonradan çözüldü`}
                  stacked={false}
                />
              </View>

              {map.subjects.map((subject) => (
                <View key={subject.subject} style={styles.block}>
                  <SectionHeader
                    title={subject.pendingCount > 0 ? `${subject.subject} · ${subject.pendingCount} tekrar bekliyor` : subject.subject}
                  />
                  <Card variant="outlined" style={styles.list}>
                    {subject.topics.map((gap, index) => (
                      <AnimatedPressable
                        key={`${gap.subject}|${gap.topic}`}
                        onPress={() => openTopic(gap)}
                        style={[styles.row, index > 0 ? styles.divided : null]}
                        accessibilityRole="button"
                        accessibilityLabel={`${gap.topic}. ${gapCountLabel(gap)}. ${gap.stateLabel}.`}
                        accessibilityHint="Bu konudaki çözemediğin soruları açar"
                      >
                        <View style={styles.rowText}>
                          <Text style={styles.topic} numberOfLines={2}>
                            {gap.topic}
                          </Text>
                          <Text style={styles.count}>{gapCountLabel(gap)}</Text>
                          <Text style={styles.state}>{gap.stateLabel}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textTertiary} accessibilityElementsHidden />
                      </AnimatedPressable>
                    ))}
                  </Card>
                </View>
              ))}
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
  block: {
    gap: spacing.sm,
  },
  stats: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  list: {
    paddingVertical: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: minTouchTarget,
    paddingVertical: spacing.sm,
  },
  divided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  topic: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  count: {
    ...typography.body,
    color: colors.textSecondary,
  },
  state: {
    ...typography.caption,
    color: colors.textTertiary,
  },
}));
