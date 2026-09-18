import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@components/ui/EmptyState";
import { useAuth } from "@features/authentication";
import { colors } from "@theme/colors";
import { contentWidth } from "@theme/layout";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

import { AnalyticsErrorBanner, AnalyticsLoading } from "../components/AnalyticsFeedback";
import { AnalyticsHeader } from "../components/AnalyticsHeader";
import { ArchiveEntryRow } from "../components/ArchiveEntryRow";
import { SegmentedPills } from "../components/SegmentedPills";
import { useStudentAnalytics } from "../hooks/useStudentAnalytics";
import { ANALYTICS_ROUTES, archivedQuestionRoute } from "../routes";
import { ARCHIVE_FILTER_LABEL, ARCHIVE_INTRO, archiveEmptyCopy } from "../services/analyticsPresentation";
import {
  ARCHIVE_FILTERS,
  ArchiveEntry,
  ArchiveFilter,
  buildQuestionArchive,
  filterArchive,
  summarizeArchive,
} from "../services/studentAnalytics";

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function keyExtractor(entry: ArchiveEntry): string {
  return entry.questionId;
}

// Phase 107 — "Çözemediğim Sorular", the student's learning archive.
//
// A long memory, not a list of failures. A question is here because recorded
// evidence says the student struggled with it, and it STAYS here after they
// solve it — only its state changes. The list is virtualised because it grows
// for the life of the account; the rows carry a small preview, never the
// question body.
export function QuestionArchiveScreen() {
  useThemeSubscription();
  const params = useLocalSearchParams<{ subject?: string | string[]; topic?: string | string[] }>();
  const subject = firstParam(params.subject);
  const topic = firstParam(params.topic);
  const isScoped = Boolean(subject || topic);

  const { firebaseUser } = useAuth();
  const { items, loadedAt, isLoading, hasLoaded, error } = useStudentAnalytics(firebaseUser?.uid);
  const [filter, setFilter] = useState<ArchiveFilter>("all");

  const now = loadedAt;
  const scoped = useMemo(
    () => filterArchive(buildQuestionArchive(items), "all", { subject, topic }),
    [items, subject, topic],
  );
  const summary = useMemo(() => summarizeArchive(scoped), [scoped]);
  const visible = useMemo(() => filterArchive(scoped, filter), [scoped, filter]);
  const scopeLabel = [topic, subject].filter(Boolean).join(" · ");

  const openEntry = useCallback((questionId: string) => {
    router.push(archivedQuestionRoute(questionId) as never);
  }, []);

  const clearScope = useCallback(() => {
    router.setParams({ subject: "", topic: "" } as never);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: ArchiveEntry }) => <ArchiveEntryRow entry={item} now={now} onPress={openEntry} />,
    [now, openEntry],
  );

  const empty = archiveEmptyCopy(summary, filter, isScoped);

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <FlatList
        data={hasLoaded ? visible : []}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        style={styles.scroller}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={Separator}
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={9}
        removeClippedSubviews
        ListHeaderComponent={
          <View style={styles.header}>
            <AnalyticsHeader
              title="Çözemediğim Sorular"
              subtitle={ARCHIVE_INTRO}
              backFallbackHref={ANALYTICS_ROUTES.overview}
            />

            {isScoped ? (
              <Pressable
                onPress={clearScope}
                accessibilityRole="button"
                accessibilityLabel={`Konu filtresi: ${scopeLabel}. Kaldırmak için dokun.`}
                style={styles.scopeChip}
              >
                <Ionicons name="pricetag-outline" size={iconSize.xs} color={colors.primary} accessibilityElementsHidden />
                <Text style={styles.scopeText}>{scopeLabel}</Text>
                <Ionicons name="close" size={iconSize.xs} color={colors.textSecondary} accessibilityElementsHidden />
              </Pressable>
            ) : null}

            {hasLoaded && summary.total > 0 ? (
              <View style={styles.controls}>
                <SegmentedPills
                  options={ARCHIVE_FILTERS}
                  value={filter}
                  onChange={setFilter}
                  labelFor={(option) => ARCHIVE_FILTER_LABEL[option]}
                  accessibilityLabel="Arşiv filtresi"
                />
                <Text style={styles.summary}>
                  {summary.pending} tekrar bekliyor · {summary.solvedLater} sonradan çözüldü
                </Text>
              </View>
            ) : null}

            {error ? <AnalyticsErrorBanner title="Arşivin şu an yüklenemedi" message={error} /> : null}
            {isLoading && !hasLoaded ? <AnalyticsLoading /> : null}
          </View>
        }
        ListEmptyComponent={
          hasLoaded && !error ? (
            <EmptyState icon="archive-outline" title={empty.title} description={empty.description} />
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
  controls: {
    gap: spacing.xs,
  },
  summary: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  scopeChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryMuted,
  },
  scopeText: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  separator: {
    height: spacing.sm,
  },
}));
