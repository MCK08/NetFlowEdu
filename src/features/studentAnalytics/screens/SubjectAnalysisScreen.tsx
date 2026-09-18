import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { memo, useCallback, useMemo } from "react";
import { FlatList, Pressable, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@components/ui/Card";
import { EmptyState } from "@components/ui/EmptyState";
import { StatusLabel } from "@components/ui/StatusLabel";
import { useAuth } from "@features/authentication";
import { conceptStateLabel, ConceptNode } from "@features/study/services/conceptMasteryMap";
import { colors } from "@theme/colors";
import { contentWidth } from "@theme/layout";
import { iconSize, minTouchTarget, stackAtFontScale } from "@theme/sizes";
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
  CONCEPT_ICON,
  CONCEPT_TONE,
  successRateSentence,
  successRateValue,
} from "../services/analyticsPresentation";
import { buildSubjectAnalysis, SubjectAnalysis } from "../services/studentAnalytics";

function subjectFacts(subject: SubjectAnalysis): string {
  const parts = [`${subject.questionCount} soru`];
  if (subject.knownOutcomeCount > 0) parts.push(`${subject.knownOutcomeCount} kayıtlı deneme`);
  return parts.join(" · ");
}

// A real subject can never collide with the unknown bucket's key: every real
// one is prefixed. ("Diğer" is itself a real subject a teacher can pick.)
function subjectKey(subject: SubjectAnalysis): string {
  return subject.isUnknownSubject ? "unknown-subject" : `subject:${subject.subject}`;
}

const TopicRow = memo(function TopicRow({
  node,
  onOpen,
}: {
  node: ConceptNode;
  onOpen: (subject: string, topic: string) => void;
}) {
  useThemeSubscription();
  const label = conceptStateLabel(node);
  const tone = CONCEPT_TONE[node.presentation];
  return (
    <Pressable
      onPress={() => onOpen(node.subject, node.topic)}
      accessibilityRole="button"
      accessibilityLabel={`${node.topic}. ${label}. ${node.questionCount} soru.`}
      accessibilityHint="Konu ayrıntısını açar"
      style={styles.topicRow}
    >
      <View style={styles.topicText}>
        <Text style={styles.topicName}>{node.topic}</Text>
        <StatusLabel
          icon={CONCEPT_ICON[node.presentation]}
          tone={tone}
          textStyle={[styles.topicState, { color: toneTextColor(tone) }]}
        >
          {label}
        </StatusLabel>
      </View>
      <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textTertiary} accessibilityElementsHidden />
    </Pressable>
  );
});

const SubjectCard = memo(function SubjectCard({
  subject,
  stacked,
  onOpenTopic,
}: {
  subject: SubjectAnalysis;
  stacked: boolean;
  onOpenTopic: (subject: string, topic: string) => void;
}) {
  useThemeSubscription();
  const rate = successRateSentence(subject.successRatePercent, subject.knownOutcomeCount);
  const pending = subject.pendingArchiveCount > 0 ? `${subject.pendingArchiveCount} soru tekrar bekliyor` : null;

  return (
    <Card variant="outlined" style={styles.card}>
      {/* The summary is ONE accessible node; the topic rows below stay their
          own buttons. Making the whole card accessible would swallow them. */}
      <View
        style={styles.summary}
        accessible
        accessibilityLabel={[subject.subject, `${subject.questionCount} soru`, rate, pending]
          .filter(Boolean)
          .join(". ")}
      >
        <View style={stacked ? styles.headStacked : styles.head}>
          <Text style={styles.subjectName}>{subject.subject}</Text>
          <Text style={styles.rate}>{successRateValue(subject.successRatePercent)}</Text>
        </View>
        <Text style={styles.facts}>{subjectFacts(subject)}</Text>
        {subject.successRatePercent !== null ? (
          <RateBar percent={subject.successRatePercent} />
        ) : (
          <Text style={styles.facts}>Çözme oranı için henüz yeterli kayıt yok</Text>
        )}
        {pending ? (
          <StatusLabel
            icon="time-outline"
            tone="primary"
            textStyle={[styles.pending, { color: toneTextColor("primary") }]}
          >
            {pending}
          </StatusLabel>
        ) : null}
        {subject.isUnknownSubject ? (
          <Text style={styles.facts}>Bu soruların ders bilgisi okunamadı; konu ayrıntısı yok.</Text>
        ) : null}
      </View>

      {subject.topics.length > 0 ? (
        <View style={styles.topics}>
          {subject.topics.map((node) => (
            <TopicRow key={node.id} node={node} onOpen={onOpenTopic} />
          ))}
        </View>
      ) : null}
    </Card>
  );
});

// Phase 107 — "Derslere Göre Analiz".
//
// One scannable column: each subject as a quiet card with its real counts and
// a completeness-safe rate, and its topics beneath, each carrying Öğrenme
// Haritam's own verdict and wording. No per-subject donut, no score, and the
// questions whose subject is unknown are kept (last) rather than dropped.
export function SubjectAnalysisScreen() {
  useThemeSubscription();
  const { firebaseUser } = useAuth();
  const { items, loadedAt, isLoading, hasLoaded, error } = useStudentAnalytics(firebaseUser?.uid);
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= stackAtFontScale;

  const now = loadedAt;
  const subjects = useMemo(() => buildSubjectAnalysis(items, now), [items, now]);

  const openTopic = useCallback((subject: string, topic: string) => {
    router.push({ pathname: ANALYTICS_ROUTES.topic, params: { subject, topic } } as never);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: SubjectAnalysis }) => <SubjectCard subject={item} stacked={stacked} onOpenTopic={openTopic} />,
    [stacked, openTopic],
  );

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <FlatList
        data={hasLoaded ? subjects : []}
        keyExtractor={subjectKey}
        renderItem={renderItem}
        style={styles.scroller}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={Separator}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <AnalyticsHeader
              title="Derslere Göre"
              subtitle="Tüm çalışma geçmişin"
              backFallbackHref={ANALYTICS_ROUTES.overview}
            />
            {error ? <AnalyticsErrorBanner title="Dersler şu an yüklenemedi" message={error} /> : null}
            {isLoading && !hasLoaded ? <AnalyticsLoading /> : null}
          </View>
        }
        ListEmptyComponent={
          hasLoaded && !error ? (
            <EmptyState
              icon="library-outline"
              title="Henüz ders verisi yok"
              description="Soru çözdükçe çalıştığın dersler ve konular burada listelenir."
            />
          ) : null
        }
      />
    </SafeAreaView>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = themedStyles(() => ({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroller: {
    flex: 1,
    width: "100%",
    maxWidth: contentWidth.readable,
    alignSelf: "center",
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
  },
  header: {
    gap: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  separator: {
    height: spacing.sm,
  },
  card: {
    gap: spacing.md,
  },
  summary: {
    gap: spacing.xs,
  },
  head: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  headStacked: {
    gap: spacing.xxs,
  },
  subjectName: {
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
  pending: {
    ...typography.caption,
    fontWeight: "600",
  },
  topics: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  topicRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: minTouchTarget,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  topicText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  topicName: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  topicState: {
    ...typography.caption,
  },
}));
