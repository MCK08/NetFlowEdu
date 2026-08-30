import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@components/ui/Card";
import { EmptyState } from "@components/ui/EmptyState";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { useClassPerformance } from "@features/teacher/hooks/useClassPerformance";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { typography } from "@theme/typography";

import { buildTeacherLearningStory } from "../services/buildTeacherLearningStory";
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
  const { attentionCards, isLoading } = useClassPerformance(classId);

  const story = useMemo(() => buildTeacherLearningStory(attentionCards), [attentionCards]);

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.column}>
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>{story.headline}</Text>
            {story.subheadline ? (
              <Text style={styles.heroSubtitle}>{story.subheadline}</Text>
            ) : null}
          </View>

          {isLoading && attentionCards.length === 0 ? (
            <View style={styles.skeletons}>
              <LoadingSkeleton height={110} borderRadius={16} />
              <LoadingSkeleton height={110} borderRadius={16} />
            </View>
          ) : story.isFirstRun ? (
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
                        <Ionicons
                          name={SECTION_ICON[section.id]}
                          size={18}
                          color={sectionColor(section.id)}
                        />
                      </View>
                      <View style={styles.sectionText}>
                        <Text style={styles.sectionTitle}>{section.title}</Text>
                        <Text style={styles.sectionDescription}>{section.description}</Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={colors.textTertiary}
                      />
                    </View>
                  </Card>
                </Pressable>
              ))}

              <View style={styles.footnote}>
                <Ionicons
                  name="information-circle-outline"
                  size={14}
                  color={colors.textTertiary}
                />
                <Text style={styles.footnoteText}>
                  Bu özet yalnızca bu sınıfın kayıtlı çalışma sonuçlarına dayanır.
                </Text>
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
    maxWidth: 760,
    gap: spacing.md,
  },
  hero: {
    gap: spacing.xxs,
    paddingTop: spacing.xs,
  },
  heroTitle: {
    ...typography.displayLg,
    color: colors.textPrimary,
  },
  heroSubtitle: {
    ...typography.body,
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
    alignItems: "center",
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
    alignItems: "center",
    gap: spacing.xxs,
    paddingTop: spacing.xs,
  },
  footnoteText: {
    ...typography.caption,
    color: colors.textTertiary,
    flexShrink: 1,
  },
}));
