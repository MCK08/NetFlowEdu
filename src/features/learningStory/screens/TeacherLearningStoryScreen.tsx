import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppBackButton } from "@components/ui/AppBackButton";
import { Card } from "@components/ui/Card";
import { EmptyState } from "@components/ui/EmptyState";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { StatusLabel } from "@components/ui/StatusLabel";
import { useClassRoom } from "@features/classes/hooks/useClassRoom";
import { ClassPerformanceIdentity } from "@features/teacher/components/ClassPerformanceIdentity";
import { useClassPerformance } from "@features/teacher/hooks/useClassPerformance";
import { classTrendLabel, learningTrendGlyph } from "@features/teacher/services/statusGlyphs";
import { colors } from "@theme/colors";
import { contentWidth } from "@theme/layout";
import { radius } from "@theme/radius";
import { stackAtFontScale } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { typography } from "@theme/typography";

import { buildTeacherLearningStory } from "../services/buildTeacherLearningStory";
import { resolveStoryPanel } from "../services/storyPanel";
import { TeacherStorySectionKind } from "../services/learningStoryTypes";

// Phase 56 — "Sınıfın İlerleme Hikâyesi".
//
// SCOPE IS ONE CLASS, HONESTLY
//
// This reads useClassPerformance for the class it was opened from — the same
// hook and the same single class the Teacher Dashboard and Class Performance
// already load. Fanning out across every class the teacher owns would be one
// query per class, which is exactly the N+1 Phase 50 avoided, so the screen is
// scoped to the class the teacher navigated from rather than silently
// summarising a subset and calling it "your classes".
//
// STORY, NOT ACTION
//
// Each section routes into the intelligence that already exists (Class
// Performance, and per-student detail from there). It deliberately issues no
// recommendation of its own — Daily Flow owns that job.

/** The screen's own name, stated once. Phase 126 — it used to appear twice,
 *  here and again as the story's headline directly beneath it. */
export const CLASS_STORY_TITLE = "Sınıfın İlerleme Hikâyesi";

interface TeacherLearningStoryScreenProps {
  classId: string;
}

const SECTION_ICON: Record<TeacherStorySectionKind, keyof typeof Ionicons.glyphMap> = {
  recovering: "trending-up",
  progressing: "shield-checkmark-outline",
  watch: "eye-outline",
  persistent_struggle: "refresh-circle-outline",
};

function sectionColor(kind: TeacherStorySectionKind): string {
  // Semantic, so the four sections stay distinguishable from one another
  // rather than collapsing into one brand colour.
  if (kind === "recovering" || kind === "progressing") return colors.success;
  if (kind === "persistent_struggle") return colors.danger;
  return colors.textSecondary;
}

export function TeacherLearningStoryScreen({ classId }: TeacherLearningStoryScreenProps) {
  // Phase 75 — the error was previously discarded, so a failed class read
  // rendered "Sınıfın hikâyesi henüz oluşmadı": a statement about the class,
  // made when the truth was that we could not load it. Same fix, and same
  // banner, as the student story and the Phase 70/71 surfaces.
  // Phase 126 — `trend` was already being computed by this very hook and
  // thrown away. It is buildClassTrend's verdict over the per-day buckets the
  // snapshots already carry: the one genuinely longitudinal thing the product
  // knows about a class, on the screen whose whole question is what changed.
  // Reading it costs nothing.
  const { attentionCards, trend, isLoading, error } = useClassPerformance(classId);
  // ONE classes/{classId} get, so the story can name the class it is about.
  const classRoom = useClassRoom(classId);
  const { fontScale } = useWindowDimensions();
  // Past the accessibility sizes a section's sentence takes seven lines, and a
  // vertically centred icon and chevron float in the middle of nothing.
  const stacked = fontScale >= stackAtFontScale;

  const story = useMemo(() => buildTeacherLearningStory(attentionCards), [attentionCards]);
  const trendGlyph = learningTrendGlyph(trend);

  const panel = resolveStoryPanel({
    isLoading,
    hasError: error !== null,
    hasContent: attentionCards.length > 0,
    isFirstRun: story.isFirstRun,
  });

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.column}>
          <View style={[styles.navRow, stacked ? styles.navRowStacked : null]}>
            <AppBackButton
              fallbackHref={{ pathname: "/(teacher)/class/[classId]", params: { classId } }}
              style={styles.backButton}
            />
            <Text style={styles.navTitle} accessibilityRole="header">
              {CLASS_STORY_TITLE}
            </Text>
          </View>

          {/* Phase 126 — WHICH class this story is about. The headline that
              used to sit here said "Sınıfın ilerleme hikâyesi", the same words
              as the title directly above it, and named no class at all; a
              teacher arriving from a deep link could not tell which class they
              were reading. The identity is Sınıf Performansı's own component,
              so the two screens name a class the same way. */}
          <View style={styles.hero}>
            <ClassPerformanceIdentity classRoom={classRoom} />
            {story.subheadline ? (
              <Text style={styles.heroSubtitle}>{story.subheadline}</Text>
            ) : null}
            {/* The only longitudinal statement the evidence supports: a
                direction, in the canonical words, with the canonical mark —
                never a figure, never a reason, never a claim about what caused
                it. "Henüz yeterli veri yok" is a real answer here, not a zero. */}
            {trendGlyph ? (
              <StatusLabel icon={trendGlyph.icon} tone={trendGlyph.tone} textStyle={styles.trendText}>
                {classTrendLabel(trend)}
              </StatusLabel>
            ) : (
              <Text style={styles.trendMuted}>{classTrendLabel(trend)}</Text>
            )}
          </View>

          {error ? (
            <View style={styles.errorBanner} accessibilityRole="alert">
              <Text style={styles.errorTitle}>Sınıf hikâyesi şu an yüklenemedi</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {panel === "loading" ? (
            <View style={styles.skeletons}>
              <LoadingSkeleton height={110} borderRadius={16} />
              <LoadingSkeleton height={110} borderRadius={16} />
            </View>
          ) : panel === "error" ? null : panel === "empty" ? (
            <EmptyState
              icon="sparkles-outline"
              title="Sınıfın hikâyesi henüz oluşmadı"
              description="Öğrenciler çalıştıkça toparlanma ve zorlanma sinyalleri burada görünecek."
            />
          ) : (
            <View style={styles.sections}>
              {story.sections.map((section) => (
                <Pressable
                  key={section.id}
                  onPress={() =>
                    router.push(`/(teacher)/class/${classId}/performance` as never)
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`${section.title}. ${section.description} İncele.`}
                >
                  <Card>
                    <View style={styles.sectionRow}>
                      <View style={styles.iconWrap}>
                        {/* Decorative: the row's own label speaks the state. */}
                        <Ionicons
                          name={SECTION_ICON[section.id]}
                          size={18}
                          color={sectionColor(section.id)}
                          accessibilityElementsHidden
                        />
                      </View>
                      <View style={styles.sectionText}>
                        <Text style={styles.sectionTitle}>{section.title}</Text>
                        <Text style={styles.sectionDescription}>{section.description}</Text>
                      </View>
                      {/* Dropped once the sentence wraps: beside a seven-line
                          column a centred chevron sits alone in the middle of
                          nothing. The row still says "İncele" out loud. */}
                      {stacked ? null : (
                        <Ionicons
                          name="chevron-forward"
                          size={18}
                          color={colors.textTertiary}
                          accessibilityElementsHidden
                        />
                      )}
                    </View>
                  </Card>
                </Pressable>
              ))}

              <View style={styles.footnote}>
                {/* Decorative: the sentence beside it says the same thing. */}
                <Ionicons
                  name="information-circle-outline"
                  size={14}
                  color={colors.textTertiary}
                  accessibilityElementsHidden
                />
                <View style={styles.footnoteBody}>
                  <Text style={styles.footnoteText}>
                    Bu özet yalnızca bu sınıfın kayıtlı çalışma sonuçlarına dayanır.
                  </Text>
                </View>
              </View>
            </View>
          )}
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
    // Phase 74 — was 760, the only screen in the app with its own
    // measure. Nothing here needs more room than the student story it
    // mirrors, and the mismatch was visible when a teacher moved between
    // the two.
    maxWidth: contentWidth.readable,
    gap: spacing.md,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  navRowStacked: {
    alignItems: "flex-start",
  },
  backButton: {
    marginLeft: -spacing.sm,
  },
  // Phase 126 — the screen's one title, at the role a pushed teacher screen
  // uses (Sınıf Performansı's own). It was a muted subtitle while the real
  // heading sat underneath repeating it.
  navTitle: {
    ...typography.title,
    color: colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
  hero: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  heroSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  trendText: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  trendMuted: {
    ...typography.body,
    color: colors.textTertiary,
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
    gap: spacing.md,
  },
  sections: {
    gap: spacing.md,
  },
  sectionRow: {
    flexDirection: "row",
    // Phase 126 — the sentence wraps to several lines at the accessibility
    // sizes; centring a 36pt tile against that column floats it in the middle
    // of nothing, the same defect Phase 125 fixed on the student row.
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted,
  },
  sectionText: {
    flex: 1,
    gap: 2,
  },
  sectionTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  sectionDescription: {
    ...typography.body,
    color: colors.textSecondary,
  },
  footnote: {
    flexDirection: "row",
    // Phase 103 — top-aligned, with the sentence in its own flex column: the
    // same shape as ProfileScreen's tour row, which wraps correctly at a
    // large OS text size. A bare Text sized inside the row (by shrink or by
    // flex alone) was clipped mid-word on one line instead of wrapping.
    alignItems: "flex-start",
    gap: spacing.xxs,
    paddingTop: spacing.xs,
  },
  footnoteBody: {
    flex: 1,
    minWidth: 0,
  },
  footnoteText: {
    ...typography.caption,
    color: colors.textTertiary,
  },
}));
