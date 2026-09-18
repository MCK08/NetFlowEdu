import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@components/ui/EmptyState";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { SectionHeader } from "@components/ui/SectionHeader";
import { ROUTES } from "@constants/routes";
import { useAuth } from "@features/authentication";
import { colors } from "@theme/colors";
import { contentWidth } from "@theme/layout";
import { stackAtFontScale } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

import { AnalyticsErrorBanner, AnalyticsLoading } from "../components/AnalyticsFeedback";
import { AnalyticsHeader } from "../components/AnalyticsHeader";
import { AnalyticsNavRow } from "../components/AnalyticsNavRow";
import { ArchiveFocusCard } from "../components/ArchiveFocusCard";
import { SegmentedPills } from "../components/SegmentedPills";
import { StatTile } from "../components/StatTile";
import { useStudentAnalytics } from "../hooks/useStudentAnalytics";
import { ANALYTICS_ROUTES } from "../routes";
import {
  overviewNarrative,
  QUESTION_KIND_LABEL,
  RANGE_LABEL,
  rangeScopeLabel,
  SUCCESS_RATE_FOOTNOTE,
  successRateSentence,
  successRateValue,
} from "../services/analyticsPresentation";
import {
  ANALYTICS_RANGES,
  AnalyticsRange,
  buildAnalyticsOverview,
  buildQuestionArchive,
  buildQuestionTypeAnalysis,
  buildSubjectAnalysis,
  filterItemsByRange,
  summarizeArchive,
} from "../services/studentAnalytics";

const INTRO = "Öğrenme geçmişine bak, zorlandığın alanları gör ve geri dönmek istediğin soruları bul.";

// Phase 107 — "Kişisel Analiz", the student's own learning history.
//
// An editorial summary, not a dashboard: one intro line, a period that selects
// which questions the small facts describe, the archive as the page's single
// loud destination, then the deeper readings as quiet rows. Every number is a
// real count or a completeness-safe rate (Phase 41); nothing is a score.
export function AnalyticsOverviewScreen() {
  useThemeSubscription();
  const { firebaseUser } = useAuth();
  const { items, loadedAt, isLoading, hasLoaded, error } = useStudentAnalytics(firebaseUser?.uid);
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= stackAtFontScale;
  const [range, setRange] = useState<AnalyticsRange>("30d");

  // "Now" is when these items were read (see useStudentAnalytics), so "the
  // last 7 days" moves with every reload rather than freezing at first render.
  const now = loadedAt;
  const overview = useMemo(() => buildAnalyticsOverview(filterItemsByRange(items, range, now)), [items, range, now]);
  const archive = useMemo(() => summarizeArchive(buildQuestionArchive(items)), [items]);
  const subjects = useMemo(() => buildSubjectAnalysis(items, now), [items, now]);
  const kinds = useMemo(() => buildQuestionTypeAnalysis(items), [items]);

  const knownSubjects = subjects.filter((subject) => !subject.isUnknownSubject);
  const topicTotal = knownSubjects.reduce((sum, subject) => sum + subject.topics.length, 0);
  const subjectsDescription =
    knownSubjects.length > 0 ? `${knownSubjects.length} ders · ${topicTotal} konu` : "Çalıştığın dersler burada listelenir";
  const kindsDescription =
    kinds.rows.length > 0
      ? kinds.rows
          .map((row) => `${row.questionCount} ${QUESTION_KIND_LABEL[row.kind].toLocaleLowerCase("tr")}`)
          .join(" · ")
      : "Soru türlerine göre çalışman burada görünür";

  const narrative = overviewNarrative(overview, range);
  const isEmpty = hasLoaded && !error && items.length === 0;

  const openArchive = useCallback(() => router.push(ANALYTICS_ROUTES.archive as never), []);
  const openSubjects = useCallback(() => router.push(ANALYTICS_ROUTES.subjects as never), []);
  const openKinds = useCallback(() => router.push(ANALYTICS_ROUTES.questionTypes as never), []);
  const openAtlas = useCallback(() => router.push(ROUTES.studentLearningAtlas as never), []);
  const startStudying = useCallback(() => router.navigate(ROUTES.studentStudy as never), []);

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.column}>
          <AnalyticsHeader title="Kişisel Analiz" subtitle={INTRO} />

          {error ? <AnalyticsErrorBanner title="Analizin şu an yüklenemedi" message={error} /> : null}
          {isLoading && !hasLoaded ? <AnalyticsLoading /> : null}

          {isEmpty ? (
            <View style={styles.block}>
              <EmptyState
                icon="analytics-outline"
                title="Öğrenme geçmişin burada oluşacak"
                description="Soru çözdükçe çalıştığın dersler, zorlandığın konular ve tekrar bakmak istediğin sorular burada görünür."
              />
              <PrimaryButton label="Çalışmaya Başla" onPress={startStudying} />
            </View>
          ) : null}

          {hasLoaded && items.length > 0 ? (
            <>
              <View style={styles.block}>
                <SectionHeader title="Bu Dönem" />
                <SegmentedPills
                  options={ANALYTICS_RANGES}
                  value={range}
                  onChange={setRange}
                  labelFor={(option) => RANGE_LABEL[option]}
                  accessibilityLabel="Dönem"
                />
                <Text style={styles.scope}>{rangeScopeLabel(range)}</Text>
                <View style={stacked ? styles.tilesStacked : styles.tiles}>
                  <StatTile
                    stacked={stacked}
                    value={String(overview.questionCount)}
                    label="Çalıştığın soru"
                    accessibilityLabel={`${overview.questionCount} soru üzerinde çalıştın`}
                  />
                  <StatTile
                    stacked={stacked}
                    value={String(overview.topicCount)}
                    label="Çalıştığın konu"
                    accessibilityLabel={`${overview.topicCount} konu üzerinde çalıştın`}
                  />
                  <StatTile
                    stacked={stacked}
                    value={successRateValue(overview.successRatePercent)}
                    label="Çözme oranı"
                    accessibilityLabel={successRateSentence(overview.successRatePercent, overview.knownOutcomeCount)}
                  />
                </View>
                {narrative ? <Text style={styles.narrative}>{narrative}</Text> : null}
                {overview.successRatePercent !== null ? (
                  <Text style={styles.footnote}>{SUCCESS_RATE_FOOTNOTE}</Text>
                ) : null}
              </View>

              <ArchiveFocusCard summary={archive} onOpen={openArchive} />

              <View style={styles.block}>
                <SectionHeader title="Derinlemesine" />
                <AnalyticsNavRow
                  icon="library-outline"
                  title="Derslere Göre"
                  description={subjectsDescription}
                  onPress={openSubjects}
                  accessibilityHint="Derslerini ve konularını açar"
                />
                <AnalyticsNavRow
                  icon="layers-outline"
                  title="Soru Türlerine Göre"
                  description={kindsDescription}
                  onPress={openKinds}
                  accessibilityHint="Soru türlerine göre çalışmanı açar"
                />
                {/* The existing landscape of the same evidence — linked, not
                    rebuilt. Kişisel Analiz reads history; the Atlas reads where
                    the signals stand right now. */}
                <AnalyticsNavRow
                  icon="git-network-outline"
                  title="Öğrenme Atlasım"
                  description="Konuların, zorlanmaların ve tekrar zamanların tek görünümde"
                  onPress={openAtlas}
                  accessibilityHint="Öğrenme Atlasını açar"
                />
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
    // Phase 104 (B2) rhythm: a clear step between blocks, tighter inside them.
    gap: spacing.xl,
  },
  block: {
    gap: spacing.sm,
  },
  scope: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  tiles: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.sm,
  },
  tilesStacked: {
    gap: spacing.sm,
  },
  narrative: {
    ...typography.body,
    color: colors.textPrimary,
  },
  footnote: {
    ...typography.caption,
    color: colors.textTertiary,
  },
}));
