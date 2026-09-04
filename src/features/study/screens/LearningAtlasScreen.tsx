import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@components/ui/EmptyState";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { ROUTES } from "@constants/routes";
import { useAuth } from "@features/authentication";
import { useStudentAssignments } from "@features/assignments/hooks/useStudentAssignments";
import { useLearningTrail } from "@features/learningStory/hooks/useLearningTrail";
import { colors } from "@theme/colors";
import { contentWidth } from "@theme/layout";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

import { LearningAtlasView } from "../components/LearningAtlasView";
import { useLearningInsights } from "../hooks/useLearningInsights";
import { useStudyQueue } from "../hooks/useStudyQueue";
import {
  ATLAS_LENSES,
  AtlasLens,
  atlasEmptyLensCopy,
  atlasLensLabel,
  atlasSummaryFacts,
  buildLearningAtlas,
  filterAtlasRegions,
} from "../services/learningAtlas";
import { resolveStudentNextAction } from "../services/studentNextAction";
import { nextActionCopy } from "../services/studyPresentation";

// Phase 76 — "Öğrenme Atlasım".
//
// WHAT THIS SCREEN IS FOR, AND WHAT IT IS NOT
//
// Daily Flow answers "what should I do next". Concept Mastery Map answers
// "where does my evidence stand". Pattern Memory answers "how is difficulty
// repeating". Learning Story answers "how has my learning changed". Session
// Reflection answers "what just happened".
//
// The Atlas answers only: "how do those verified signals sit together right
// now" — one landscape, with the product's current focus placed inside it, a
// way to change perspective, and the real ordered motion behind any concept
// the student opens. It decides nothing. Every number, verdict and sentence on
// it is carried in from the module that owns it (see learningAtlas.ts).
//
// DATA COST
//
// The same hooks the Study Hub already mounts — study items, the summary
// listener, assignments — plus Phase 59's one bounded event query. Mounting
// assignments is deliberate rather than incidental: the Şimdi focus MUST be
// the same answer the Hub would give, and assignments outrank everything else
// in resolveStudentNextAction. Resolving it without them would let the Atlas
// point at a different "now" than Daily Flow, which is worse than paying for
// the query. Nothing here is per-concept, per-subject or per-node.
export function LearningAtlasScreen() {
  useThemeSubscription();
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid;
  const { width } = useWindowDimensions();

  const { summary } = useStudyQueue(uid);
  const { items, plan, insights, isLoading: isItemsLoading, error } = useLearningInsights(uid, summary);
  // Phase 59's own bounded query, reused rather than reimplemented. Non-fatal
  // by design: without it every node simply has no ordered motion, and the
  // cumulative evidence above it stays perfectly valid.
  const { events, isLoading: isEventsLoading } = useLearningTrail(uid);
  const { cards: assignmentCards } = useStudentAssignments(uid);

  const [lens, setLens] = useState<AtlasLens>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const nextAction = useMemo(
    () =>
      resolveStudentNextAction({
        items,
        plan,
        weakTopics: insights.weakTopics,
        assignmentCards,
        now: Date.now(),
      }),
    [items, plan, insights.weakTopics, assignmentCards],
  );

  const atlas = useMemo(
    () =>
      buildLearningAtlas({
        items,
        events,
        nextAction,
        // The SAME copy function the Hub's next-action card uses, so the two
        // surfaces can never drift into two wordings of one decision.
        focusCopy: nextActionCopy(nextAction, Date.now()),
        now: Date.now(),
      }),
    [items, events, nextAction],
  );

  const visibleRegions = useMemo(
    () => filterAtlasRegions(atlas.regions, lens),
    [atlas.regions, lens],
  );
  const facts = useMemo(() => atlasSummaryFacts(atlas), [atlas]);

  const handleSelect = useCallback((id: string) => {
    setSelectedId((current) => (current === id ? null : id));
  }, []);

  // Every destination below is an EXISTING route. The Atlas adds no targeted
  // session selector, so a "study just this concept" button would be a promise
  // the app cannot keep — these route to the canonical entry points instead.
  const handleStartStudy = useCallback(() => {
    router.push(ROUTES.studentAdaptiveSession as never);
  }, []);
  const handleStartReview = useCallback(() => {
    router.push(ROUTES.studentReviewSession as never);
  }, []);
  const handleOpenPatterns = useCallback(() => {
    router.push(ROUTES.studentStrugglePatterns as never);
  }, []);
  const handleOpenConceptMap = useCallback(() => {
    router.push(ROUTES.studentConceptMasteryMap as never);
  }, []);

  const isLoading = isItemsLoading || isEventsLoading;
  // Phase 75's rule: a technical failure never renders as an empty landscape.
  const showEmpty = !isLoading && !error && atlas.isEmpty;
  const showLensEmpty = !isLoading && !error && !atlas.isEmpty && visibleRegions.length === 0;
  const isWide = width >= ATLAS_WIDE_BREAKPOINT;

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.column, isWide ? styles.columnWide : null]}>
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <Pressable
                onPress={() => router.back()}
                style={styles.backButton}
                accessibilityRole="button"
                accessibilityLabel="Geri"
                hitSlop={8}
              >
                <Ionicons name="chevron-back" size={iconSize.md} color={colors.textPrimary} />
              </Pressable>
              <Text style={styles.title}>Öğrenme Atlasım</Text>
            </View>
            <Text style={styles.subtitle}>
              Öğrenme kanıtlarının şu anda nasıl durduğunu tek görünümde gör.
            </Text>
            {facts.length > 0 ? <Text style={styles.facts}>{facts.join(" · ")}</Text> : null}
          </View>

          {/* Perspective, not filtering-as-judgement: each lens selects among
              verdicts that already exist, and changes nothing underneath. */}
          {!atlas.isEmpty ? (
            <View style={styles.lensRow} accessibilityRole="tablist">
              {ATLAS_LENSES.map((option) => {
                const isActive = option === lens;
                const count = atlas.lensCounts[option];
                return (
                  <Pressable
                    key={option}
                    onPress={() => setLens(option)}
                    style={[styles.lens, isActive ? styles.lensActive : null]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: isActive }}
                    accessibilityLabel={`${atlasLensLabel(option)}, ${count} konu`}
                  >
                    <Text style={[styles.lensLabel, isActive ? styles.lensLabelActive : null]}>
                      {atlasLensLabel(option)}
                    </Text>
                    <Text style={[styles.lensCount, isActive ? styles.lensCountActive : null]}>
                      {count}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorBanner} accessibilityRole="alert">
              <Text style={styles.errorTitle}>Atlasın şu an yüklenemedi</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {isLoading && items.length === 0 ? (
            <View style={styles.skeletons}>
              <LoadingSkeleton height={90} borderRadius={radius.xl} />
              <LoadingSkeleton height={120} borderRadius={radius.xl} />
              <LoadingSkeleton height={120} borderRadius={radius.xl} />
            </View>
          ) : null}

          {showEmpty ? (
            <View style={styles.empty}>
              <EmptyState
                icon="git-network-outline"
                title="Çalıştıkça öğrenme atlasın burada oluşacak"
                description="NetFlowEdu, çözüm ve tekrarlarından doğrulanmış öğrenme kanıtları oluşturur."
              />
              <PrimaryButton label="Çalışmaya Başla" onPress={handleStartStudy} />
            </View>
          ) : null}

          {showLensEmpty ? (
            <View style={styles.lensEmpty} accessibilityRole="text">
              <Text style={styles.lensEmptyText}>{atlasEmptyLensCopy(lens)}</Text>
            </View>
          ) : null}

          {!isLoading && !atlas.isEmpty && visibleRegions.length > 0 ? (
            <LearningAtlasView
              focus={lens === "all" ? atlas.focus : null}
              regions={visibleRegions}
              selectedId={selectedId}
              onSelect={handleSelect}
              onOpenPatterns={handleOpenPatterns}
              onOpenConceptMap={handleOpenConceptMap}
              onStartReview={handleStartReview}
              onStartStudy={handleStartStudy}
              isWide={isWide}
            />
          ) : null}

          {!atlas.isEmpty ? (
            <Pressable
              onPress={handleOpenConceptMap}
              style={styles.deeperLink}
              accessibilityRole="button"
              accessibilityLabel="Konu haritasını aç"
              accessibilityHint="Kavram bazlı öğrenme haritasını açar"
            >
              <Text style={styles.deeperLinkText}>Konu Haritasını Gör</Text>
              <Ionicons name="chevron-forward" size={iconSize.xs} color={colors.primary} />
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Below this the spine keeps content on one side; above it, nodes alternate
// across a centred spine. Chosen so the two-sided layout only engages when
// there is genuinely room for two readable columns, never on a large phone.
const ATLAS_WIDE_BREAKPOINT = 760;

// The Atlas is the one screen whose composition uses horizontal room as
// meaning rather than as line length, so it is allowed a wider measure than
// `contentWidth.readable` — but a deliberate one, not the whole monitor.
const ATLAS_WIDE_WIDTH = 880;

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
  columnWide: {
    maxWidth: ATLAS_WIDE_WIDTH,
  },
  header: {
    gap: spacing.xxs,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  backButton: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -spacing.sm,
  },
  title: {
    ...typography.screenTitle,
    color: colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  facts: {
    ...typography.caption,
    color: colors.textTertiary,
  },

  lensRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  lens: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  lensActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  lensLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  lensLabelActive: {
    color: colors.textInverse,
  },
  lensCount: {
    ...typography.label,
    color: colors.textTertiary,
  },
  lensCountActive: {
    color: colors.textInverse,
  },

  errorBanner: {
    backgroundColor: colors.dangerMuted,
    borderRadius: radius.lg,
    padding: spacing.sm,
    gap: 2,
  },
  errorTitle: {
    ...typography.bodyStrong,
    color: colors.danger,
  },
  errorText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  skeletons: {
    gap: spacing.sm,
  },
  empty: {
    gap: spacing.md,
    paddingTop: spacing.lg,
  },
  lensEmpty: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  lensEmptyText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  deeperLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    minHeight: minTouchTarget,
  },
  deeperLinkText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "600",
  },
}));
