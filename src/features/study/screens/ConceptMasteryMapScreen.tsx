import { router } from "expo-router";
import { useCallback, useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Ionicons } from "@expo/vector-icons";

import { EmptyState } from "@components/ui/EmptyState";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { ROUTES } from "@constants/routes";
import { useAuth } from "@features/authentication";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

import { ConceptMasteryMapView } from "../components/ConceptMasteryMapView";
import { useLearningInsights } from "../hooks/useLearningInsights";
import { useStudyQueue } from "../hooks/useStudyQueue";
import { buildConceptMasteryMap, conceptMapSummaryFacts } from "../services/conceptMasteryMap";

const MAX_CONTENT_WIDTH = 680;

// Phase 70 — "Öğrenme Haritam".
//
// DATA COST
//
// Everything on this screen is derived in memory from the items
// useLearningInsights already loads — the same bounded getAllStudyItems +
// shared metadata cache the Study Hub mounts. No per-topic query, no per-
// concept read, no studyEvents scan, no listener, nothing new on the backend.
//
// WHAT THIS SCREEN IS FOR
//
// Daily Flow answers "what should I do next". Learning Story answers "how has
// my learning changed". Session Reflection answers "what happened just now".
// This one answers only "where does my learning evidence stand" — and stops
// there, so the four surfaces stay four distinct answers rather than one
// dashboard.
export function ConceptMasteryMapScreen() {
  useThemeSubscription();
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid;

  // The summary listener is already this hook's own; insights takes it as a
  // parameter rather than opening a second one.
  const { summary } = useStudyQueue(uid);
  const { items, isLoading, error } = useLearningInsights(uid, summary);

  const map = useMemo(() => buildConceptMasteryMap({ items, now: Date.now() }), [items]);
  const facts = useMemo(() => conceptMapSummaryFacts(map), [map]);

  const handleOpenPatterns = useCallback(() => {
    router.push(ROUTES.studentStrugglePatterns as never);
  }, []);

  const handleStudy = useCallback(() => {
    // The existing canonical practice entry point — this screen explains where
    // evidence stands, it does not become a second thing that decides what to
    // practise. There is no concept-targeted session to route to, so inventing
    // "Denklemleri Çalış" would be a button that could not keep its promise.
    router.push(ROUTES.studentAdaptiveSession as never);
  }, []);

  const showEmpty = !isLoading && !error && map.isEmpty;

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.column}>
          <View style={styles.header}>
            <Text style={styles.title}>Öğrenme Haritam</Text>
            <Text style={styles.subtitle}>Çalışmalarından oluşan öğrenme görünümün.</Text>
          </View>

          {facts.length > 0 ? (
            <View style={styles.factRow}>
              {facts.map((fact) => (
                <View key={fact} style={styles.factChip}>
                  <Text style={styles.factText}>{fact}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* A technical failure must never read as "not enough evidence yet" —
              one is our problem, the other is a statement about the student. */}
          {error ? (
            <View style={styles.errorBanner} accessibilityRole="alert">
              <Text style={styles.errorTitle}>Harita şu an yüklenemedi</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {isLoading && items.length === 0 ? (
            <View style={styles.skeletons}>
              <LoadingSkeleton height={120} borderRadius={radius.xl} />
              <LoadingSkeleton height={120} borderRadius={radius.xl} />
            </View>
          ) : null}

          {showEmpty ? (
            <View style={styles.empty}>
              <EmptyState
                icon="map-outline"
                title="Çalıştıkça öğrenme haritan burada oluşacak"
                description="NetFlowEdu, çözüm ve tekrarlarından gerçek öğrenme kanıtları oluşturur."
              />
              <PrimaryButton label="Çalışmaya Başla" onPress={handleStudy} />
            </View>
          ) : null}

          {!map.isEmpty ? <ConceptMasteryMapView map={map} /> : null}

          {/* Phase 71 — a secondary path, deliberately not another Study Hub
              card. The map answers "where does my evidence stand"; this goes
              one level deeper into "how is the difficulty repeating", which is
              only a meaningful question once the map has been read. */}
          {!map.isEmpty ? (
            <Pressable
              onPress={handleOpenPatterns}
              accessibilityRole="button"
              accessibilityLabel="Zorlanma Örüntülerim. Son öğrenme kayıtlarında tekrar eden zorlanmaları gör."
              style={styles.patternsEntry}
            >
              <Ionicons name="pulse-outline" size={iconSize.sm} color={colors.primary} />
              <View style={styles.patternsText}>
                <Text style={styles.patternsTitle}>Zorlanma Örüntülerim</Text>
                <Text style={styles.patternsDescription}>
                  Tekrar eden zorlanmaları gör
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textTertiary} />
            </Pressable>
          ) : null}

          {!map.isEmpty ? (
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
    maxWidth: MAX_CONTENT_WIDTH,
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
  factRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  factChip: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  factText: {
    ...typography.caption,
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
  patternsEntry: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: minTouchTarget,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  patternsText: {
    flex: 1,
    gap: 2,
  },
  patternsTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  patternsDescription: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  footer: {
    paddingTop: spacing.xs,
  },
}));
