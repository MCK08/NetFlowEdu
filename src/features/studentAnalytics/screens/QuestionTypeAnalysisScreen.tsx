import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { ScrollView, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@components/ui/Card";
import { EmptyState } from "@components/ui/EmptyState";
import { StatusLabel } from "@components/ui/StatusLabel";
import { useAuth } from "@features/authentication";
import { colors } from "@theme/colors";
import { contentWidth } from "@theme/layout";
import { radius } from "@theme/radius";
import { iconSize, stackAtFontScale } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

import { AnalyticsErrorBanner, AnalyticsLoading } from "../components/AnalyticsFeedback";
import { AnalyticsHeader } from "../components/AnalyticsHeader";
import { RateBar } from "../components/RateBar";
import { toneTextColor } from "../components/toneColor";
import { useStudentAnalytics } from "../hooks/useStudentAnalytics";
import { ANALYTICS_ROUTES } from "../routes";
import {
  QUESTION_KIND_ICON,
  QUESTION_KIND_LABEL,
  questionKindNote,
  successRateSentence,
  successRateValue,
} from "../services/analyticsPresentation";
import { buildQuestionTypeAnalysis, QuestionKind, QuestionKindAnalysis } from "../services/studentAnalytics";

// Resolved per render (the Phase 52 rule), and only ever an assist: every
// segment is named with its count in the legend beside it.
function kindColor(kind: QuestionKind): string {
  return kind === "multiple_choice" ? colors.primary : colors.brandCyan;
}

function KindCard({ row, stacked }: { row: QuestionKindAnalysis; stacked: boolean }) {
  useThemeSubscription();
  const label = QUESTION_KIND_LABEL[row.kind];
  const note = questionKindNote(row.pendingArchiveCount);
  const facts = [`${row.questionCount} soru`];
  if (row.knownOutcomeCount > 0) facts.push(`${row.knownOutcomeCount} kayıtlı deneme`);

  return (
    <Card variant="outlined" style={styles.card}>
      <View
        style={styles.cardBody}
        accessible
        accessibilityLabel={[label, facts.join(", "), successRateSentence(row.successRatePercent, row.knownOutcomeCount), note]
          .filter(Boolean)
          .join(". ")}
      >
        <View style={stacked ? styles.headStacked : styles.head}>
          <View style={styles.kind}>
            <View style={styles.iconWrap}>
              <Ionicons name={QUESTION_KIND_ICON[row.kind]} size={iconSize.sm} color={colors.primary} accessibilityElementsHidden />
            </View>
            <Text style={styles.kindLabel}>{label}</Text>
          </View>
          <Text style={styles.rate}>{successRateValue(row.successRatePercent)}</Text>
        </View>
        <Text style={styles.facts}>{facts.join(" · ")}</Text>
        {row.successRatePercent !== null ? (
          <RateBar percent={row.successRatePercent} />
        ) : (
          <Text style={styles.facts}>Çözme oranı için henüz yeterli kayıt yok</Text>
        )}
        {note ? (
          <StatusLabel icon="time-outline" tone="primary" textStyle={[styles.note, { color: toneTextColor("primary") }]}>
            {note}
          </StatusLabel>
        ) : null}
      </View>
    </Card>
  );
}

// Phase 107 — "Soru Türlerine Göre".
//
// Only the formats the product actually stores (multiple choice, and questions
// without choices), and only ones the student has met. One quiet split bar of
// real question counts instead of a rainbow donut, then a row per format. The
// note under a row points at questions worth revisiting; it never explains WHY
// a format is hard, because nothing recorded could support a cause.
export function QuestionTypeAnalysisScreen() {
  useThemeSubscription();
  const { firebaseUser } = useAuth();
  const { items, isLoading, hasLoaded, error } = useStudentAnalytics(firebaseUser?.uid);
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= stackAtFontScale;

  const analysis = useMemo(() => buildQuestionTypeAnalysis(items), [items]);
  const typedTotal = analysis.rows.reduce((sum, row) => sum + row.questionCount, 0);
  const legend = analysis.rows
    .map((row) => `${row.questionCount} ${QUESTION_KIND_LABEL[row.kind].toLocaleLowerCase("tr")}`)
    .join(", ");

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.column}>
          <AnalyticsHeader
            title="Soru Türlerine Göre"
            subtitle="Tüm çalışma geçmişin"
            backFallbackHref={ANALYTICS_ROUTES.overview}
          />

          {error ? <AnalyticsErrorBanner title="Soru türleri şu an yüklenemedi" message={error} /> : null}
          {isLoading && !hasLoaded ? <AnalyticsLoading /> : null}

          {hasLoaded && !error && analysis.rows.length === 0 ? (
            <EmptyState
              icon="layers-outline"
              title="Henüz soru türü verisi yok"
              description="Soru çözdükçe hangi türde soruları çalıştığın burada görünür."
            />
          ) : null}

          {analysis.rows.length > 0 ? (
            <>
              <Card variant="outlined" style={styles.card}>
                <View accessible accessibilityLabel={`Çalıştığın sorular: ${legend}.`} style={styles.cardBody}>
                  <View style={styles.split} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    {analysis.rows.map((row) => (
                      <View
                        key={row.kind}
                        style={[styles.segment, { flex: row.questionCount / typedTotal, backgroundColor: kindColor(row.kind) }]}
                      />
                    ))}
                  </View>
                  <View style={styles.legend}>
                    {analysis.rows.map((row) => (
                      <View key={row.kind} style={styles.legendItem}>
                        <View style={[styles.swatch, { backgroundColor: kindColor(row.kind) }]} />
                        <Text style={styles.facts}>
                          {QUESTION_KIND_LABEL[row.kind]} · {row.questionCount}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              </Card>

              {analysis.rows.map((row) => (
                <KindCard key={row.kind} row={row} stacked={stacked} />
              ))}

              {analysis.unresolvedCount > 0 ? (
                <Text style={styles.footnote}>
                  {analysis.unresolvedCount} sorunun türü bilinmiyor; bu sorular artık görüntülenemiyor.
                </Text>
              ) : null}
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
  card: {
    gap: spacing.sm,
  },
  cardBody: {
    gap: spacing.xs,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  headStacked: {
    gap: spacing.xxs,
  },
  kind: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexShrink: 1,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryMuted,
  },
  kindLabel: {
    ...typography.cardTitle,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  rate: {
    ...typography.title,
    color: colors.textPrimary,
  },
  facts: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  note: {
    ...typography.caption,
    fontWeight: "600",
  },
  split: {
    flexDirection: "row",
    height: 10,
    borderRadius: radius.pill,
    overflow: "hidden",
    gap: 2,
  },
  segment: {
    height: "100%",
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
  },
  footnote: {
    ...typography.caption,
    color: colors.textTertiary,
  },
}));
