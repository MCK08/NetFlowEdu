import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@components/ui/EmptyState";
import { IconButton } from "@components/ui/IconButton";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { SectionHeader } from "@components/ui/SectionHeader";
import { ROUTES } from "@constants/routes";
import { useAuth } from "@features/authentication";
import { useFeedLaunch } from "@features/feed/hooks/useFeedLaunch";
import { useLearningTrail } from "@features/learningStory/hooks/useLearningTrail";
import { ArchiveEntryRow } from "@features/studentAnalytics/components/ArchiveEntryRow";
import { ANALYTICS_ROUTES, archivedQuestionRoute } from "@features/studentAnalytics/routes";
import { PlanStepRow } from "@features/studyPlan/components/PlanStepRow";
import { usePlanStepNavigation } from "@features/studyPlan/hooks/usePlanStepNavigation";
import { useStudyPlan } from "@features/studyPlan/hooks/useStudyPlan";
import { PLAN_ROUTES, planStepRoute } from "@features/studyPlan/routes";
import { gapCountLabel } from "@features/studyPlan/services/learningMaps";
import { shortDateLabel, stepStartLabel, stepTitle, stepWhy } from "@features/studyPlan/services/planPresentation";
import { buildStudyWorkspace } from "@features/studyPlan/services/studyWorkspace";
import { useNavigationGuard } from "@hooks/useNavigationGuard";
import { colors } from "@theme/colors";
import { contentWidth } from "@theme/layout";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";

import { AssignedWorkSection } from "../components/AssignedWorkSection";
import { DailyGoalEditor } from "../components/DailyGoalEditor";
import { PracticeLauncher } from "../components/PracticeLauncher";

// Phase 109 — Çalış is ONE scrolling workspace.
//
// Everything the student needs to decide and to act sits in this scroll, in
// this order: what to do now (one action), today's plan, the questions they
// could not solve, a practice launcher, the topics that are waiting, the
// areas that stand, the progress that is on record, and the goal. Sections
// sit on the background with headers and compact rows; a surface is used
// only where a group needs one. Deep readings (the archive, the maps, the
// plan step, Kişisel Analiz) stay one tap away as text links, never as a
// wall of tiles.
//
// Every number here comes from the same sources the deep screens read
// (useStudyPlan → Phase 108 plan, Phase 107 archive, Phase 70 concept map,
// Phase 59 events) through buildStudyWorkspace; this screen does not derive
// a state, a priority or a strength of its own.

export const FOCUS_TITLE = "Şimdi Ne Yapmalısın?";
export const TODAY_TITLE = "Bugünün Planı";
export const UNRESOLVED_TITLE = "Çözemediğim Sorular";
// Phase 117 — the utilities label themselves ("Soruları Filtrele",
// "Konuları Keşfet"), so the section header above them said the first
// tile's words a second time and is gone.
export const PRACTICE_TILE_FILTER = "Soruları Filtrele";
export const PRACTICE_TILE_EXPLORE = "Konuları Keşfet";
export const STRUGGLE_TITLE = "Zorlandığın Konular";
export const STRENGTHS_TITLE = "Güçlü Olduğun Alanlar";
export const PROGRESS_TITLE = "İlerlemen";
export const GOAL_TITLE = "Hedef ve Ayarlar";

export function StudyScreen() {
  useThemeSubscription();
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid;
  const { plan, items, summary, completedDays, assignmentCards, now, isLoading, hasLoaded, error, refresh } =
    useStudyPlan(uid);
  const trail = useLearningTrail(uid);
  const startStep = usePlanStepNavigation();
  const launchFeed = useFeedLaunch();
  const guardedNavigate = useNavigationGuard();

  const workspace = useMemo(
    () => buildStudyWorkspace({ plan, items, now, completedDays, events: trail.events }),
    [plan, items, now, completedDays, trail.events],
  );

  const refreshTrail = trail.refresh;
  useFocusEffect(
    useCallback(() => {
      refreshTrail();
    }, [refreshTrail]),
  );
  const handleRefresh = useCallback(() => {
    refresh();
    refreshTrail();
  }, [refresh, refreshTrail]);

  const openStep = useCallback((stepId: string) => router.push(planStepRoute(stepId) as never), []);
  const openArchived = useCallback((questionId: string) => router.push(archivedQuestionRoute(questionId) as never), []);
  const openAssignment = useCallback(
    (assignmentId: string) =>
      guardedNavigate(`assignment-${assignmentId}`, () => router.push(`/(student)/assignment/${assignmentId}` as never)),
    [guardedNavigate],
  );
  const goTo = useCallback((href: string) => router.push(href as never), []);

  const focus = workspace.focus;
  const openAssignments = useMemo(() => assignmentCards.filter((card) => card.status !== "completed"), [assignmentCards]);
  // The filter picker starts closed; opening it is one tap and it is the
  // same PracticeLauncher, with the same feed handoff.
  const [isPracticeOpen, setIsPracticeOpen] = useState(false);
  // Counted from the steps this screen already renders — no second source,
  // no planner call, and it says "tamamlandı" only about completed ones.
  const planProgressLabel = useMemo(() => {
    const done = plan.steps.filter((step) => step.state === "completed").length;
    return `${done} / ${plan.steps.length} tamamlandı`;
  }, [plan.steps]);
  const goalCaption = summary.dailyGoal > 0 ? `Bugün ${summary.reviewedToday} / ${summary.dailyGoal} soru` : null;

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <ScrollView
        style={styles.scroller}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={false} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        {/* HEADER */}
        <View style={styles.headerRow}>
          <View style={styles.identity}>
            <Text style={styles.title}>Çalış</Text>
            {goalCaption ? <Text style={styles.moment}>{goalCaption}</Text> : null}
          </View>
          {/* Phase 117 — the study preferences this screen owns (goal, plan
              size, focus subjects). NOT the app's Settings: those stay on
              Profil (Phase 115). Reachable from the top now as well as from
              "Hedef ve Ayarlar" at the foot of the page. */}
          <IconButton
            icon="options-outline"
            onPress={() => goTo(PLAN_ROUTES.settings)}
            accessibilityLabel="Çalışma ayarları"
            color={colors.textSecondary}
          />
        </View>

        {error ? (
          <View style={styles.errorBanner} accessibilityRole="alert">
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {isLoading && !hasLoaded ? (
          <View style={styles.skeleton}>
            <LoadingSkeleton height={140} borderRadius={radius.xxl} />
            <LoadingSkeleton height={72} borderRadius={radius.lg} />
            <LoadingSkeleton height={72} borderRadius={radius.lg} />
          </View>
        ) : null}

        {hasLoaded ? (
          <>
            {/* FOCUS — the one dominant action on the screen. */}
            <View style={styles.section}>
              <SectionHeader title={FOCUS_TITLE} />
              <View style={styles.focus}>
                {/* Phase 117 — the mark that makes this the page's one heavy
                    object. Decorative: every word beside it is already text. */}
                <View style={styles.focusMark}>
                  <Ionicons name="navigate-circle" size={iconSize.lg} color={colors.primary} accessibilityElementsHidden />
                </View>
                {focus.kind === "step" ? (
                  <>
                    <Text style={styles.focusEyebrow}>
                      Bugünkü adım · {focus.index + 1} / {focus.total}
                    </Text>
                    <Text style={styles.focusTitle}>{stepTitle(focus.step)}</Text>
                    <Text style={styles.focusDetail}>{focus.step.reason}</Text>
                    <Text style={styles.focusWhy}>{stepWhy(focus.step)}</Text>
                    <PrimaryButton
                      label={stepStartLabel(focus.step)}
                      onPress={() => startStep(focus.step)}
                      accessibilityHint="Bu adımın çalışmasını açar"
                    />
                  </>
                ) : focus.kind === "complete" ? (
                  <>
                    <Text style={styles.focusEyebrow}>Bugünkü plan tamamlandı</Text>
                    <Text style={styles.focusTitle}>İyi iş.</Text>
                    <Text style={styles.focusDetail}>{focus.sentence}</Text>
                    <PrimaryButton
                      label="Soru Çözmeye Devam Et"
                      onPress={() => launchFeed({})}
                      accessibilityHint="Soru akışını açar"
                    />
                  </>
                ) : (
                  <>
                    <Text style={styles.focusEyebrow}>Başlangıç</Text>
                    <Text style={styles.focusTitle}>Soru çözmeye başla</Text>
                    <Text style={styles.focusDetail}>
                      Çözdükçe zorlandığın konular, tekrar zamanı gelen sorular ve atanan çalışmalar burada bir plana dönüşür.
                    </Text>
                    <PrimaryButton label="Soruları Aç" onPress={() => launchFeed({})} accessibilityHint="Soru akışını açar" />
                  </>
                )}
              </View>
            </View>

            {/* TODAY — the plan, inline. */}
            {plan.steps.length > 0 ? (
              <View style={styles.section}>
                <SectionHeader
                  title={TODAY_TITLE}
                  action={{ label: "Haftaya bak", onPress: () => goTo(PLAN_ROUTES.week) }}
                />
                <Text style={styles.planProgress}>{planProgressLabel}</Text>
                <View style={styles.rows}>
                  {plan.steps.map((step, index) => (
                    <PlanStepRow
                      key={step.id}
                      step={step}
                      index={index}
                      total={plan.steps.length}
                      onPress={openStep}
                      divided={index > 0}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            {openAssignments.length > 0 ? <AssignedWorkSection cards={openAssignments} onOpen={openAssignment} /> : null}

            {/* UNRESOLVED — Phase 107's archive, inline. */}
            <View style={styles.section}>
              <SectionHeader
                title={UNRESOLVED_TITLE}
                action={
                  workspace.archivePendingCount > ARCHIVE_ROWS_SHOWN || workspace.archiveSolvedLaterCount > 0
                    ? { label: "Tümünü Gör", onPress: () => goTo(ANALYTICS_ROUTES.archive) }
                    : undefined
                }
              />
              {workspace.archivePendingCount === 0 ? (
                <Text style={styles.quiet}>
                  {workspace.archiveSolvedLaterCount > 0
                    ? `Şu anda tekrar bekleyen sorun yok; ${workspace.archiveSolvedLaterCount} soruyu sonradan çözdün.`
                    : "Çözemediğin bir soru olduğunda burada yerini alır."}
                </Text>
              ) : (
                <>
                  <Text style={styles.count}>{workspace.archivePendingCount} soru tekrar bekliyor</Text>
                  <View style={styles.archiveList}>
                    {workspace.archivePreview.map((entry) => (
                      <ArchiveEntryRow key={entry.questionId} entry={entry} now={now} onPress={openArchived} />
                    ))}
                  </View>
                  <TextAction
                    label="Bu sorularla çalış"
                    icon="play-circle-outline"
                    onPress={() => launchFeed({ channel: "struggles" })}
                    hint="Zorlandığın sorularla soru akışını açar"
                  />
                </>
              )}
            </View>

            {/* PRACTICE — filtered questions, launched into the one feed. */}
            <View style={styles.section}>
              {/* Phase 117 — the picker used to stand open, so the subject and
                  topic chip rows were the tallest thing between the plan and
                  the topics below. It is the same PracticeLauncher, behind a
                  tile that says what it does; the second tile is Phase 70's
                  concept map, which was previously reachable only from the
                  foot of the page. */}
              <View style={styles.tiles}>
                <UtilityTile
                  icon="options-outline"
                  title={PRACTICE_TILE_FILTER}
                  detail="Ders, konu, tür seç"
                  expanded={isPracticeOpen}
                  onPress={() => setIsPracticeOpen((open) => !open)}
                />
                <UtilityTile
                  icon="map-outline"
                  title={PRACTICE_TILE_EXPLORE}
                  detail="Konu haritasına git"
                  onPress={() => goTo(ROUTES.studentConceptMasteryMap)}
                />
              </View>
              {isPracticeOpen ? <PracticeLauncher /> : null}
            </View>

            {/* STRUGGLE — the topics that are waiting. */}
            {workspace.struggleTopics.length > 0 ? (
              <View style={styles.section}>
                <SectionHeader title={STRUGGLE_TITLE} action={{ label: "Tümünü Gör", onPress: () => goTo(PLAN_ROUTES.gaps) }} />
                {/* Phase 117 — chips, not full-width rows. These are a place
                    to go, not work to do: as rows they carried the same
                    weight as a plan step. The label, the destination and the
                    spoken sentence are unchanged. */}
                <View style={styles.chips}>
                  {workspace.struggleTopics.map((topic) => (
                    <Pressable
                      key={`${topic.subject}|${topic.topic}`}
                      onPress={() =>
                        goTo(
                          `${ANALYTICS_ROUTES.archive}?subject=${encodeURIComponent(topic.subject)}&topic=${encodeURIComponent(topic.topic)}`,
                        )
                      }
                      style={styles.chip}
                      accessibilityRole="button"
                      accessibilityLabel={`${topic.subject}, ${topic.topic}. ${gapCountLabel(topic)}. ${topic.stateLabel}.`}
                      accessibilityHint="Bu konudaki çözemediğin soruları açar"
                    >
                      <Ionicons name="arrow-forward-circle" size={iconSize.sm} color={colors.danger} accessibilityElementsHidden />
                      <Text style={styles.chipText}>{topic.topic}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {/* STRENGTHS — Phase 70's "steady" topics. */}
            {workspace.strongAreas.length > 0 ? (
              <View style={styles.section}>
                <SectionHeader title={STRENGTHS_TITLE} action={{ label: "Tümünü Gör", onPress: () => goTo(PLAN_ROUTES.strengths) }} />
                <View style={styles.rows}>
                  {workspace.strongAreas.map((area, index) => (
                    <View
                      key={`${area.subject}|${area.topic}`}
                      style={[styles.row, index > 0 ? styles.divided : null]}
                      accessible
                      accessibilityLabel={`${area.subject}, ${area.topic}. İstikrarlı. ${area.fact}.`}
                    >
                      <Ionicons name="checkmark-circle" size={iconSize.sm} color={colors.success} accessibilityElementsHidden />
                      <View style={styles.rowText}>
                        <Text style={styles.rowTitle}>
                          {area.topic} · İstikrarlı
                        </Text>
                        <Text style={styles.rowDetail}>
                          {area.subject} · {area.fact}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {/* PROGRESS — facts on record, no curve. */}
            {workspace.progressFacts.length > 0 || workspace.progressEvents.length > 0 ? (
              <View style={styles.section}>
                <SectionHeader title={PROGRESS_TITLE} action={{ label: "Detay", onPress: () => goTo(PLAN_ROUTES.progress) }} />
                {workspace.progressFacts.length > 0 ? (
                  <View style={styles.facts}>
                    {workspace.progressFacts.map((fact) => (
                      <View key={fact.id} style={styles.fact} accessible accessibilityLabel={`${fact.value} ${fact.label}`}>
                        <Text style={styles.factValue}>{fact.value}</Text>
                        <Text style={styles.factLabel}>{fact.label}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {workspace.progressEvents.length > 0 ? (
                  <View style={styles.rows}>
                    {workspace.progressEvents.map((event, index) => (
                      <View
                        key={event.id}
                        style={[styles.row, index > 0 ? styles.divided : null]}
                        accessible
                        accessibilityLabel={`${shortDateLabel(event.occurredAt)}. ${event.sentence}${event.subject ? `. ${event.subject} ${event.topic}` : ""}.`}
                      >
                        <Text style={styles.eventDate}>{shortDateLabel(event.occurredAt)}</Text>
                        <View style={styles.rowText}>
                          <Text style={styles.rowTitle}>{event.sentence}</Text>
                          {event.subject ? (
                            <Text style={styles.rowDetail}>
                              {event.subject} · {event.topic}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}

            {!workspace.hasAnyEvidence && plan.steps.length === 0 ? (
              <EmptyState
                icon="school-outline"
                title="Henüz kayıtlı bir çalışman yok"
                description="İlk soruyu çözdüğünde planın, zorlandığın konular ve ilerlemen burada görünmeye başlar."
              />
            ) : null}

            {/* GOAL / SETTINGS — compact, at the bottom. */}
            <View style={styles.section}>
              <SectionHeader title={GOAL_TITLE} />
              <View style={styles.rows}>
                <DailyGoalEditor currentGoal={summary.dailyGoal} onSaved={refresh} />
                <TextAction label="Plan tercihleri" icon="options-outline" onPress={() => goTo(PLAN_ROUTES.settings)} divided />
                <TextAction label="Kişisel Analiz" icon="analytics-outline" onPress={() => goTo(ANALYTICS_ROUTES.overview)} divided />
                <TextAction label="Öğrenme Atlasım" icon="git-network-outline" onPress={() => goTo(ROUTES.studentLearningAtlas)} divided />
                <TextAction label="İlerleme Hikâyem" icon="book-outline" onPress={() => goTo("/(student)/learning-story")} divided />
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const ARCHIVE_ROWS_SHOWN = 3;

interface TextActionProps {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  hint?: string;
  divided?: boolean;
}

interface UtilityTileProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  onPress: () => void;
  /** Present only on the tile that discloses something in place. */
  expanded?: boolean;
}

/** Phase 117 — a half-width entry: a glyph, what it is, what it does. Two of
 *  them fit the line the open filter picker used to take on its own. */
function UtilityTile({ icon, title, detail, onPress, expanded }: UtilityTileProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tile, expanded ? styles.tileExpanded : null]}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      accessibilityState={expanded === undefined ? undefined : { expanded }}
    >
      <Ionicons name={icon} size={iconSize.md} color={colors.primary} accessibilityElementsHidden />
      <View style={styles.tileText}>
        <Text style={styles.tileTitle}>{title}</Text>
        <Text style={styles.tileDetail}>{detail}</Text>
      </View>
    </Pressable>
  );
}

/** A quiet navigation row: words, a glyph, a chevron. Not a button, not a card. */
function TextAction({ label, icon, onPress, hint, divided }: TextActionProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, divided ? styles.divided : null]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
    >
      <Ionicons name={icon} size={iconSize.sm} color={colors.primary} accessibilityElementsHidden />
      <Text style={styles.link}>{label}</Text>
      <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textTertiary} accessibilityElementsHidden />
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  // Phase 74 — the reading measure the rest of the product already uses.
  scroller: {
    flex: 1,
    width: "100%",
    maxWidth: contentWidth.readable,
    alignSelf: "center",
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  identity: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  title: {
    ...typography.screenTitle,
    color: colors.textPrimary,
  },
  moment: {
    ...typography.body,
    color: colors.textSecondary,
  },
  skeleton: {
    gap: spacing.md,
  },
  section: {
    gap: spacing.sm,
  },
  // The one tinted surface on the screen: the focus.
  focus: {
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.xxl,
    padding: spacing.md,
    gap: spacing.xs,
  },
  focusMark: {
    alignSelf: "flex-start",
  },
  focusEyebrow: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.primary,
  },
  focusTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  focusDetail: {
    ...typography.body,
    color: colors.textPrimary,
  },
  focusWhy: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  planProgress: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  tiles: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  tile: {
    // Two per line while they fit; one each once the text needs the width.
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 150,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
  },
  tileExpanded: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  tileText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  tileTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  tileDetail: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  chipText: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.textPrimary,
    flexShrink: 1,
  },
  rows: {
    gap: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: minTouchTarget,
    paddingVertical: spacing.sm,
  },
  divided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  rowDetail: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  link: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
  quiet: {
    ...typography.body,
    color: colors.textSecondary,
  },
  count: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  archiveList: {
    gap: spacing.xs,
  },
  facts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  fact: {
    flexGrow: 1,
    flexBasis: 120,
    minWidth: 0,
    gap: 2,
    paddingVertical: spacing.xs,
  },
  factValue: {
    ...typography.title,
    color: colors.textPrimary,
  },
  factLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  eventDate: {
    ...typography.caption,
    color: colors.textTertiary,
    width: 48,
  },
  errorBanner: {
    backgroundColor: colors.dangerMuted,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
  },
}));
