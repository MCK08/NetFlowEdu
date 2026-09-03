import { router } from "expo-router";
import { useCallback, useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@components/ui/EmptyState";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { ROUTES } from "@constants/routes";
import { useAuth } from "@features/authentication";
import { useLearningTrail } from "@features/learningStory/hooks/useLearningTrail";
import { colors } from "@theme/colors";
import { contentWidth } from "@theme/layout";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

import { StrugglePatternListView } from "../components/StrugglePatternListView";
import { useLearningInsights } from "../hooks/useLearningInsights";
import { useStudyQueue } from "../hooks/useStudyQueue";
import {
  buildStrugglePatternMemory,
  patternAbsenceCopy,
} from "../services/strugglePatternMemory";

// Phase 71 — "Zorlanma Örüntülerim".
//
// WHY THIS IS NOT A MISTAKE REPORT
//
// NetFlowEdu cannot say WHY a student got something wrong: no authored
// misconception metadata exists, and the selected choice is never persisted.
// What it can prove is repetition, so that is exactly what this screen shows.
// The title is deliberately "örüntü" rather than "hata" — the records support
// a statement about recurrence, not a diagnosis.
//
// DATA COST
//
// One bounded Phase 59 query, opened only when this screen is (the SAME
// getRecentLearningEvents the Learning Story already uses, limit 40), plus the
// items useLearningInsights already loads. Study Hub and the Concept Map gain
// no new read from this feature existing.
export function StrugglePatternsScreen() {
  useThemeSubscription();
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid;

  const { summary } = useStudyQueue(uid);
  const { items, isLoading: isLoadingItems, error } = useLearningInsights(uid, summary);
  // Phase 59's own bounded query, reused rather than reimplemented. It fails
  // silently by design: without chronology the patterns still stand on their
  // counters, they simply show no ordered trail.
  const { events, isLoading: isLoadingEvents } = useLearningTrail(uid);

  const memory = useMemo(
    () => buildStrugglePatternMemory({ items, events }),
    [items, events],
  );

  const handleStudy = useCallback(() => {
    // The existing canonical practice entry point. Phase 71 adds no targeted
    // selector, so a "study just this topic" button would be a promise the
    // app cannot keep.
    router.push(ROUTES.studentAdaptiveSession as never);
  }, []);

  const isLoading = isLoadingItems || isLoadingEvents;
  const absence = patternAbsenceCopy(memory);
  const showAbsence = !isLoading && !error && memory.isEmpty;

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.column}>
          <View style={styles.header}>
            <Text style={styles.title}>Zorlanma Örüntülerim</Text>
            <Text style={styles.subtitle}>
              Son öğrenme kayıtlarında tekrar eden zorlanmaları gör.
            </Text>
          </View>

          {/* A technical failure must never be mistaken for "nothing is
              repeating" — one is our problem, the other is a statement about
              the student's learning. */}
          {error ? (
            <View style={styles.errorBanner} accessibilityRole="alert">
              <Text style={styles.errorTitle}>Örüntüler şu an yüklenemedi</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {isLoading && items.length === 0 ? (
            <View style={styles.skeletons}>
              <LoadingSkeleton height={130} borderRadius={radius.xl} />
              <LoadingSkeleton height={130} borderRadius={radius.xl} />
            </View>
          ) : null}

          {showAbsence ? (
            <View style={styles.empty}>
              <EmptyState
                icon="pulse-outline"
                title={absence.title}
                description={absence.description}
              />
              <PrimaryButton label="Çalışmaya Devam Et" onPress={handleStudy} />
            </View>
          ) : null}

          {!memory.isEmpty ? (
            <>
              <StrugglePatternListView patterns={memory.patterns} />
              <View style={styles.footer}>
                <PrimaryButton label="Çalışmaya Devam Et" onPress={handleStudy} />
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
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xxs,
  },
  title: {
    ...typography.displayLg,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
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
  },
  footer: {
    paddingTop: spacing.xs,
  },
}));
