import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { memo, useCallback, useRef, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { EmptyState } from "@components/ui/EmptyState";
import { StatusLabel } from "@components/ui/StatusLabel";
import { AnalyticsErrorBanner, AnalyticsLoading } from "@features/studentAnalytics/components/AnalyticsFeedback";
import { AnalyticsHeader } from "@features/studentAnalytics/components/AnalyticsHeader";
import { ANALYTICS_ROUTES, questionSolvingRoute } from "@features/studentAnalytics/routes";
import { mapStudyErrorToMessage } from "@features/study/services/studyErrorMapper";
import { colors } from "@theme/colors";
import { contentWidth } from "@theme/layout";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

import {
  COMMUNITY_BAND_ICON,
  COMMUNITY_BAND_LABEL,
  COMMUNITY_BAND_TONE,
  OWN_RELATION_ICON,
  OWN_RELATION_LABEL,
} from "../services/communityBand";
import { CommunityDifficultQuestion, listCommunityDifficultQuestions } from "../services/communityDifficultyService";

const INTRO =
  "Başka öğrencilerin de zorlandığı sorular. Kimse görünmez; yalnızca kaç kişinin denediği ve zorlanmanın ne kadar yaygın olduğu.";

const Row = memo(function Row({
  row,
  onPress,
}: {
  row: CommunityDifficultQuestion;
  onPress: (questionId: string) => void;
}) {
  useThemeSubscription();
  const topicLine = [row.subject, row.topic].filter(Boolean).join(" · ");
  const spoken = [
    topicLine || "Soru",
    COMMUNITY_BAND_LABEL[row.band],
    `${row.cohortSize} öğrenci denedi`,
    OWN_RELATION_LABEL[row.ownRelation],
  ].join(". ");

  return (
    <AnimatedPressable
      onPress={() => onPress(row.questionId)}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint="Soruyu açar"
    >
      <View style={styles.thumb}>
        {row.imageUrl ? (
          <Image source={{ uri: row.imageUrl }} style={styles.image} contentFit="cover" transition={150} />
        ) : (
          <Ionicons name="image-outline" size={iconSize.md} color={colors.textTertiary} accessibilityElementsHidden />
        )}
      </View>
      <View style={styles.text}>
        <Text style={styles.topic} numberOfLines={2}>
          {topicLine || "Soru"}
        </Text>
        <StatusLabel icon={COMMUNITY_BAND_ICON[row.band]} tone={COMMUNITY_BAND_TONE[row.band]} textStyle={styles.band}>
          {`${COMMUNITY_BAND_LABEL[row.band]} · ${row.cohortSize} öğrenci`}
        </StatusLabel>
        <StatusLabel icon={OWN_RELATION_ICON[row.ownRelation]} tone="muted" textStyle={styles.own}>
          {OWN_RELATION_LABEL[row.ownRelation]}
        </StatusLabel>
      </View>
      <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textTertiary} accessibilityElementsHidden />
    </AnimatedPressable>
  );
});

// Phase 108 — "Toplulukta Zorlayıcı Sorular".
//
// A discovery list, not a leaderboard: questions the student may read, ranked
// by an anonymous band from a server-side aggregate, with the student's OWN
// relation to each ("sen de tekrar deniyorsun") shown to them alone. Nothing
// here names another person, and nothing here ranks people.
export function CommunityDifficultQuestionsScreen() {
  useThemeSubscription();
  const [rows, setRows] = useState<CommunityDifficultQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const next = await listCommunityDifficultQuestions();
      if (requestRef.current !== requestId) return;
      setRows(next);
      setHasLoaded(true);
    } catch (err) {
      if (requestRef.current !== requestId) return;
      setError(mapStudyErrorToMessage(err));
    } finally {
      if (requestRef.current === requestId) setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const open = useCallback((questionId: string) => router.push(questionSolvingRoute(questionId) as never), []);

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <FlatList
        data={hasLoaded ? rows : []}
        keyExtractor={(row) => row.questionId}
        renderItem={({ item }) => <Row row={item} onPress={open} />}
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
              title="Toplulukta Zorlayıcı Sorular"
              subtitle={INTRO}
              backFallbackHref={ANALYTICS_ROUTES.overview}
            />
            {error ? <AnalyticsErrorBanner title="Topluluk sinyali şu an yüklenemedi" message={error} /> : null}
            {isLoading && !hasLoaded ? <AnalyticsLoading /> : null}
          </View>
        }
        ListEmptyComponent={
          hasLoaded && !error ? (
            <EmptyState
              icon="people-outline"
              title="Topluluk karşılaştırması için henüz yeterli veri yok"
              description="Bir soruyu en az beş farklı öğrenci denediğinde burada görünür."
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: minTouchTarget,
    padding: spacing.sm,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  topic: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  band: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  own: {
    ...typography.caption,
    color: colors.textTertiary,
  },
}));
