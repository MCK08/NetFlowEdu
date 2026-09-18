import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@components/ui/Card";
import { EmptyState } from "@components/ui/EmptyState";
import { useAuth } from "@features/authentication";
import { AnalyticsErrorBanner, AnalyticsLoading } from "@features/studentAnalytics/components/AnalyticsFeedback";
import { AnalyticsHeader } from "@features/studentAnalytics/components/AnalyticsHeader";
import { useStudentAnalytics } from "@features/studentAnalytics/hooks/useStudentAnalytics";
import { ANALYTICS_ROUTES } from "@features/studentAnalytics/routes";
import { colors } from "@theme/colors";
import { contentWidth } from "@theme/layout";
import { iconSize } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

import { buildStrongAreas } from "../services/learningMaps";

export const STRENGTHS_EMPTY_TITLE = "Güçlü alanlarını göstermek için biraz daha çalışma verisi gerekiyor.";

// Phase 108 — "Güçlü Alanlarım": the topics Phase 70 reads as "İstikrarlı",
// each with its own supporting fact. Not a ranking and not a score; a
// topic is either here on evidence or not here at all.
export function StrengthsScreen() {
  useThemeSubscription();
  const { firebaseUser } = useAuth();
  const { items, loadedAt, isLoading, hasLoaded, error } = useStudentAnalytics(firebaseUser?.uid);
  const areas = useMemo(() => buildStrongAreas(items, loadedAt), [items, loadedAt]);

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.column}>
          <AnalyticsHeader
            title="Güçlü Alanlarım"
            subtitle="Kayıtlı çözümlerinde istikrarlı başarı gösterdiğin konular."
            backFallbackHref={ANALYTICS_ROUTES.overview}
          />

          {error ? <AnalyticsErrorBanner title="Güçlü alanlar şu an yüklenemedi" message={error} /> : null}
          {isLoading && !hasLoaded ? <AnalyticsLoading /> : null}

          {hasLoaded && !error && areas.length === 0 ? (
            <EmptyState
              icon="ribbon-outline"
              title={STRENGTHS_EMPTY_TITLE}
              description="Bir konuda birkaç soruyu üst üste çözdüğünde o konu burada yerini alır."
            />
          ) : null}

          {hasLoaded && areas.length > 0 ? (
            <Card variant="outlined" style={styles.list}>
              {areas.map((area, index) => (
                <View
                  key={`${area.subject}|${area.topic}`}
                  style={[styles.row, index > 0 ? styles.divided : null]}
                  accessible
                  accessibilityLabel={`${area.subject}, ${area.topic}. İstikrarlı. ${area.fact}.`}
                >
                  <View style={styles.mark}>
                    <Ionicons name="checkmark-circle" size={iconSize.md} color={colors.success} accessibilityElementsHidden />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.topic} numberOfLines={2}>
                      {area.subject} — {area.topic}
                    </Text>
                    <Text style={styles.fact}>{area.fact}</Text>
                  </View>
                </View>
              ))}
            </Card>
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
  list: {
    paddingVertical: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  divided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  mark: {
    width: iconSize.md,
    alignItems: "center",
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
  fact: {
    ...typography.caption,
    color: colors.textSecondary,
  },
}));
