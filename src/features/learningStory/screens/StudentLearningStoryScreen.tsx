import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@components/ui/EmptyState";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { ROUTES } from "@constants/routes";
import { useAuth } from "@features/authentication";
import { useLearningInsights } from "@features/study/hooks/useLearningInsights";
import { useStudyQueue } from "@features/study/hooks/useStudyQueue";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { typography } from "@theme/typography";

import { LearningStoryMomentCard } from "../components/LearningStoryMomentCard";
import { useLearningTrail } from "../hooks/useLearningTrail";
import { buildStudentLearningStory } from "../services/buildStudentLearningStory";
import { LearningEvent, selectTopicTrail, trailInsightText } from "../services/learningTrail";
import { LearningStoryMoment } from "../services/learningStoryTypes";

// Phase 56 — "İlerleme Hikâyem".
//
// READS NOTHING NEW
//
// Both hooks below are the exact pair Study Hub already mounts, and the story
// is derived in memory from `items` they have already fetched. Learning Story
// therefore adds no Firestore read, no listener and no polling — it is a
// second interpretation of data the student's own Hub loaded anyway.
//
// The bounded content column matches the rest of the app: on a wide screen
// this stays a personal narrative rather than stretching into a dashboard.
const MAX_CONTENT_WIDTH = 680;

export function StudentLearningStoryScreen() {
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid;

  const { summary, isLoading } = useStudyQueue(uid);
  const { items } = useLearningInsights(uid, summary);

  // Phase 59 — ONE bounded query for the student's own recent chronological
  // events (see useLearningTrail). Non-fatal by design: if it fails or the
  // student has no Phase 59 history yet, `events` is empty and every card
  // falls back to Phase 56's evidence bar, which remains fully valid.
  const { events } = useLearningTrail(uid);

  const story = useMemo(() => buildStudentLearningStory(items), [items]);

  // Each topic's own trail, resolved once per render rather than inside the
  // card, so the card stays presentational and the selection stays testable.
  const trailsByMomentId = useMemo(() => {
    const map = new Map<string, LearningEvent[]>();
    for (const moment of story.moments) {
      map.set(moment.id, selectTopicTrail(events, moment.subject, moment.topic));
    }
    return map;
  }, [story.moments, events]);

  const handleAction = useCallback((moment: LearningStoryMoment) => {
    // Deliberately routes into the EXISTING adaptive session — the same
    // destination Study Hub's next-action card uses. Learning Story explains
    // what is happening; it does not become a second thing that decides what
    // to practise.
    void moment;
    router.push(ROUTES.studentAdaptiveSession as never);
  }, []);

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.column}>
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>{story.headline}</Text>
            {story.subheadline ? (
              <Text style={styles.heroSubtitle}>{story.subheadline}</Text>
            ) : null}
          </View>

          {isLoading && items.length === 0 ? (
            <View style={styles.skeletons}>
              <LoadingSkeleton height={150} borderRadius={16} />
              <LoadingSkeleton height={150} borderRadius={16} />
            </View>
          ) : story.isFirstRun ? (
            <View style={styles.firstRun}>
              <EmptyState
                icon="sparkles-outline"
                title="Henüz anlatacak bir hikâye yok"
                description="Birkaç soru çözdükçe hangi konularda ilerlediğin burada görünecek."
              />
              <PrimaryButton
                label="Çalışmaya Başla"
                onPress={() => router.push(ROUTES.studentAdaptiveSession as never)}
              />
            </View>
          ) : (
            <View style={styles.moments}>
              {story.moments.map((moment) => (
                <LearningStoryMomentCard
                  key={moment.id}
                  moment={moment}
                  onPressAction={handleAction}
                  trail={trailsByMomentId.get(moment.id) ?? []}
                  trailInsight={trailInsightText(trailsByMomentId.get(moment.id) ?? [])}
                />
              ))}

              {/* Says plainly what the evidence is, so nothing above has to
                  imply a time window it cannot prove. */}
              <View style={styles.footnote}>
                <Ionicons
                  name="information-circle-outline"
                  size={14}
                  color={colors.textTertiary}
                />
                <Text style={styles.footnoteText}>
                  Bu hikâye, kaydedilen tüm çalışma sonuçlarına dayanır.
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
    maxWidth: MAX_CONTENT_WIDTH,
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
  firstRun: {
    gap: spacing.md,
    paddingTop: spacing.lg,
  },
  moments: {
    gap: spacing.md,
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
