import { router } from "expo-router";
import { useCallback, useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppBackButton } from "@components/ui/AppBackButton";
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
import { VerifiedChoicePatternSection } from "../components/VerifiedChoicePatternSection";
import { useLearningInsights } from "../hooks/useLearningInsights";
import { useStudyQueue } from "../hooks/useStudyQueue";
import {
  buildStrugglePatternMemory,
  patternAbsenceCopy,
} from "../services/strugglePatternMemory";
import {
  buildVerifiedChoicePatterns,
  choicePatternAbsenceCopy,
} from "../services/verifiedChoicePatterns";

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

  // Phase 78 — built from the SAME bounded event window this screen already
  // loads, so it costs no query of its own.
  //
  // It lives here rather than on a route of its own because it is the same
  // question asked one level deeper: Phase 71 says a difficulty is repeating,
  // this says a specific authored SELECTION is repeating across different
  // questions. A separate destination would have made the student choose
  // between two answers to "what keeps coming back", and would have remounted
  // these identical hooks to do it.
  const choicePatterns = useMemo(
    () => buildVerifiedChoicePatterns({ events }),
    [events],
  );

  const handleStudy = useCallback(() => {
    // The existing canonical practice entry point. Phase 71 adds no targeted
    // selector, so a "study just this topic" button would be a promise the
    // app cannot keep.
    router.push(ROUTES.studentAdaptiveSession as never);
  }, []);

  const isLoading = isLoadingItems || isLoadingEvents;
  const absence = patternAbsenceCopy(memory);
  const choiceAbsence = choicePatternAbsenceCopy(choicePatterns);
  const showAbsence = !isLoading && !error && memory.isEmpty;

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.column}>
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <AppBackButton fallbackHref={ROUTES.studentConceptMasteryMap} style={styles.backButton} />
              <Text style={styles.title}>Zorlanma Örüntülerim</Text>
            </View>
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
            <StrugglePatternListView patterns={memory.patterns} />
          ) : null}

          {/* Phase 78 — a secondary section, below the general patterns and
              deliberately quieter than them. Phase 71 remains the headline
              answer to "what keeps being hard"; this narrower signal only
              exists when an author actually attached meaning to the options a
              student picked, which is a small slice of all evidence. */}
          {!isLoading && !error ? (
            choicePatterns.isEmpty ? (
              // Shown only when the general patterns already filled the screen.
              // On an otherwise empty screen the absence state above is the
              // whole message, and a second "nothing here either" under it
              // would read as piling on.
              !memory.isEmpty ? (
                <View style={styles.choiceAbsence}>
                  <Text style={styles.choiceAbsenceTitle}>{choiceAbsence.title}</Text>
                  <Text style={styles.choiceAbsenceText}>{choiceAbsence.description}</Text>
                </View>
              ) : null
            ) : (
              <VerifiedChoicePatternSection
                title="Tekrarlayan Seçim Örüntüleri"
                intro="Farklı sorularda aynı doğrulanmış seçim anlamı tekrarlandı."
                patterns={choicePatterns.patterns}
              />
            )
          ) : null}

          {!memory.isEmpty || !choicePatterns.isEmpty ? (
            <View style={styles.footer}>
              <PrimaryButton label="Çalışmaya Devam Et" onPress={handleStudy} />
            </View>
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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  backButton: {
    marginLeft: -spacing.sm,
  },
  title: {
    ...typography.displayLg,
    color: colors.textPrimary,
    flex: 1,
    minWidth: 0,
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
  choiceAbsence: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 2,
  },
  choiceAbsenceTitle: {
    ...typography.bodyStrong,
    color: colors.textSecondary,
  },
  choiceAbsenceText: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  footer: {
    paddingTop: spacing.xs,
  },
}));
