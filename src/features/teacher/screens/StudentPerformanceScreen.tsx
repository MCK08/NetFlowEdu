
import { router } from "expo-router";
import { useMemo } from "react";
import { ScrollView, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@components/ui/Card";
import { StatusLabel, statusToneColor } from "@components/ui/StatusLabel";
import { Chip } from "@components/ui/Chip";
import { EmptyState } from "@components/ui/EmptyState";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { AppBackButton } from "@components/ui/AppBackButton";
import { TeacherLearningTimeline } from "@features/learningStory/components/TeacherLearningTimeline";
import { useTeacherLearningTimeline } from "@features/learningStory/hooks/useTeacherLearningTimeline";
import {
  buildTeacherLearningTimeline,
  formatRelativeDayLabel,
} from "@features/learningStory/services/teacherLearningTimeline";
import { VerifiedChoicePatternSection } from "@features/study/components/VerifiedChoicePatternSection";
import { buildVerifiedChoicePatterns } from "@features/study/services/verifiedChoicePatterns";
import { TopicInsight } from "@features/study/services/learningInsights";
import { LearningTrend } from "@features/study/services/learningTrend";
import { colors } from "@theme/colors";
import { contentWidth } from "@theme/layout";
import { stackAtFontScale } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";

import { InterventionOutcomeCard } from "../components/InterventionOutcomeCard";
import { StudentIdentityCard } from "../components/StudentIdentityCard";
import { useInterventionEffectiveness } from "../hooks/useInterventionEffectiveness";
import { useStudentPerformanceDetail } from "../hooks/useStudentPerformanceDetail";
import { resolvePostInterventionAction } from "../services/postInterventionAction";
import {
  attentionCategoryGlyph,
  attentionCategoryLabel,
  learningTrendGlyph,
} from "../services/statusGlyphs";
import { buildStudentAttentionInsight } from "../services/studentAttention";
import { resolveStudentInterventionTopic } from "../services/teacherIntervention";

/** The screen's own name, constant. Phase 124 — the header used to print the
 *  student's name here; it is the identity card's job now, and this can never
 *  be blank or truncated. */
export const STUDENT_DETAIL_TITLE = "Öğrenci Performansı";

interface StudentPerformanceScreenProps {
  classId: string;
  studentId: string;
  studentName?: string;
}

// Phase 104 — the words only; the mark comes from learningTrendGlyph, the
// same vocabulary the class trend line and the verdict cards use.
function trendLabel(trend: LearningTrend): string {
  switch (trend) {
    case "improving":
      return "Gelişiyor";
    case "declining":
      return "Geriliyor";
    case "stable":
      return "Sabit";
    case "insufficient_data":
      return "Henüz yeterli veri yok";
  }
}

// Phase 42 — what a weak-topic chip is allowed to claim.
//
// Before this, the chip showed only "Konu (Ders)", so a teacher could not
// tell a topic the student stumbled on once from one they have failed
// repeatedly. struggledAttemptCount is the real number of struggled
// outcomes recorded in that topic (Phase 41's server counters); it is null
// for topics whose questions all predate those counters, and in that case
// the chip stays exactly as it was rather than inventing a count.
function topicChipLabel(topic: TopicInsight): string {
  const base = `${topic.topic} (${topic.subject})`;
  if (topic.struggledAttemptCount === null || topic.struggledAttemptCount <= 0) return base;
  return `${base} · ${topic.struggledAttemptCount} kez`;
}

// Phase 124 — the day comes from formatRelativeDayLabel, the SAME calendar-day
// formatter the learning flow above already prints its events with, so one
// screen cannot say "Dün" in one card and a bare date in another. Every label
// it produces is backed by this student's real lastStudiedAt; nothing is
// inferred from ordering, and past a week it falls back to the date rather
// than counting ever upwards.
function formatLastStudied(timestampMs: number | null): string {
  if (!timestampMs) return "Henüz çalışılmadı";
  const time = new Date(timestampMs).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  return `${formatRelativeDayLabel(timestampMs)} · ${time}`;
}

// Phase 27 — no outcome controls, no editable fields: every number on this
// screen is a Text/Chip rendering of buildStudentPerformanceSnapshot's
// output. A teacher still cannot change a student's answer or study state
// here, and that invariant is unchanged.
//
// Phase 43 — the screen is no longer action-less. It gained exactly ONE
// action: opening the EXISTING assignment composer, prefilled from this
// student's own evidence. Nothing is written from this screen; the write
// happens in the composer the teacher then confirms, through the same
// create path the follow-up flow has always used.
export function StudentPerformanceScreen({ classId, studentId, studentName }: StudentPerformanceScreenProps) {
  const { snapshot, items, isLoading, error, refresh } = useStudentPerformanceDetail(classId, studentId);
  // Phase 124 — past the accessibility sizes a pair of half-width tiles stops
  // holding a Turkish word without breaking it in half ("bekleye/n tekrar").
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= stackAtFontScale;

  // Phase 60 — ONE bounded query, mounted only here. Keyed by BOTH ids so a
  // slow response for the previous student can never paint over the one the
  // teacher navigated to, and so the read stays provable under the rules.
  const {
    events: timelineEvents,
    isLoading: isTimelineLoading,
    hasError: hasTimelineError,
  } = useTeacherLearningTimeline(studentId, classId);
  const timeline = useMemo(
    () => buildTeacherLearningTimeline(timelineEvents),
    [timelineEvents],
  );

  // Phase 78 — derived from the SAME bounded class-scoped events the timeline
  // above already fetched. Zero incremental reads, and nothing per pattern.
  //
  // The teacher sees the student's own verified facts, unchanged. It is
  // deliberately NOT wired into Phase 43 targeting, Phase 44 effectiveness,
  // Phase 47 post-intervention action or the Phase 73 Action Center: a
  // repeated selection is context for a human, and letting it silently raise
  // urgency would make an unproven signal start driving the intervention
  // machinery.
  const choicePatterns = useMemo(
    () => buildVerifiedChoicePatterns({ events: timelineEvents }),
    [timelineEvents],
  );
  const attention = useMemo(
    () => (snapshot ? buildStudentAttentionInsight(snapshot, Date.now()) : null),
    [snapshot],
  );
  // Phase 124 — presentation only: the mark and tone the class list already
  // draws this exact category with (statusGlyphs.ts). Never a severity of
  // this screen's own.
  const attentionGlyph = attentionCategoryGlyph(attention?.category ?? "insufficient_data");

  // Phase 44 — whether the last assignment actually delivered to this
  // student moved anything. Reads `items` (the SAME study items the snapshot
  // above is built from) rather than fetching them again; its own 2 reads
  // are the class's assignments plus this student's one submission doc.
  // Non-fatal: an error here leaves the rest of the screen untouched.
  const { intervention, result: interventionOutcome } = useInterventionEffectiveness(
    classId,
    studentId,
    items,
  );

  // Phase 47 — the only thing consuming Phase 44's verdict today. Pure,
  // in-memory, zero extra reads: derived straight from interventionOutcome,
  // which useInterventionEffectiveness above already computed from data this
  // screen already loaded. null exactly when interventionOutcome is null (no
  // delivered assignment ever targeted this student) — in that case the
  // CTA below falls back to its original, effectiveness-independent
  // behavior, unchanged from before this phase.
  const postInterventionAction = interventionOutcome
    ? resolvePostInterventionAction(interventionOutcome.effectiveness, interventionOutcome.confidence)
    : null;

  // Phase 43 — the single topic a student-level intervention should be
  // about, or null when there is nothing to intervene on. This IS the gate:
  // persistentStruggleTopics is empty for a one-off slip, for a student who
  // has already recovered, and for any student whose items predate the
  // Phase 41 counters (see studentPerformance.ts), so no action renders in
  // any of those cases rather than an action the evidence cannot justify.
  const interventionTopic = useMemo(
    () => (snapshot ? resolveStudentInterventionTopic(snapshot.persistentStruggleTopics) : null),
    [snapshot],
  );

  // Opens the EXISTING assignment composer with the same param semantics
  // AssignmentDetailScreen's follow-up flow already uses — classId,
  // subject, topic, gradeLevel and an explicit single-student target. An
  // unresolvable gradeLevel is OMITTED, never defaulted: the composer keeps
  // its own fallback, which is honest, whereas a guessed grade silently
  // changes which questions get selected.
  function openInterventionForStudent() {
    if (!interventionTopic) return;
    const params: { classId: string } & Record<string, string> = {
      classId,
      subject: interventionTopic.subject,
      topic: interventionTopic.topic,
      studentIds: studentId,
      // Phase 44 — the explicit intervention marker (see
      // CreateAssignmentScreen's isIntervention prop). This IS the gate
      // interventionTopic already is: only rendered/reachable when
      // resolveStudentInterventionTopic found real evidence, never guessed
      // from these params alone.
      intervention: "1",
    };
    if (interventionTopic.gradeLevel) params.gradeLevel = interventionTopic.gradeLevel;
    router.push({ pathname: "/(teacher)/class/[classId]/assignment/create", params });
  }

  const trendGlyph = snapshot ? learningTrendGlyph(snapshot.trend) : null;

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      {/* Phase 124 — the title is the SCREEN's name, not the student's. It
          used to be the name, capped at one line, so a real Turkish name was
          truncated mid-name and a caller that could not resolve one at all
          left the header blank (teacherStudentHref sends "" by design, and
          `"" ?? fallback` keeps the empty string). The student is named in
          full, and wrapping, in the identity card below. */}
      <View style={[styles.header, stacked ? styles.headerStacked : null]}>
        <AppBackButton fallbackHref={{ pathname: "/(teacher)/class/[classId]", params: { classId } }} style={styles.backButton} />
        <Text style={styles.title} accessibilityRole="header">
          {STUDENT_DETAIL_TITLE}
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.skeletonList}>
          <LoadingSkeleton height={100} borderRadius={16} />
          <LoadingSkeleton height={140} borderRadius={16} />
          <LoadingSkeleton height={140} borderRadius={16} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <EmptyState icon="cloud-offline-outline" title={error} />
          <PrimaryButton label="Tekrar Dene" onPress={refresh} />
        </View>
      ) : !snapshot || snapshot.totalCount === 0 ? (
        <View style={styles.centered}>
          <EmptyState
            icon="school-outline"
            title="Bu öğrenci henüz bu sınıfta çalışmadı"
            description="Öğrenci bu sınıftaki sorulardan birini çözdüğünde performansı burada görünecek."
          />
        </View>
      ) : (
        <ScrollView
          style={styles.scroller}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Phase 104 (B2) — the same cards, in the groups a teacher reads
              them in: who this is (hero + note), what is happening now (week,
              today, counts), what happened in order (flow), what was done
              about it (intervention verdict, next step, the one action), the
              topics, and the record. Tight inside a group, a step wider between
              groups; no card added, removed, renamed or reordered. */}
          <View style={styles.group}>
            {/* Phase 124 — WHO, before why. The name the entry point already
                knew; no lookup, no second read. */}
            <StudentIdentityCard studentName={studentName} />

            {/* Phase 111 — WHY this student is here comes before any number. A
                teacher arrives from an attention row asking "what is going
                on"; the evidence-based note answers that, and the overall rate
                is context for it rather than the headline above it. That
                ordering is the lock; Phase 124 only put the student's name
                above it and took the rate's hero styling away. */}
            {attention ? (
              <Card
                style={[
                  styles.attentionCard,
                  // Phase 124 — the accent bar states the same thing the word
                  // beside the mark does; the colour is never alone in saying
                  // it, and it is a thin edge rather than a filled red block.
                  { borderLeftColor: statusToneColor(attentionGlyph.tone) },
                ]}
              >
                <Text style={styles.sectionLabel}>Öğretmen notu</Text>
                {/* The canonical category, in the canonical words and mark —
                    attentionCategoryLabel/Glyph, the ones Sınıf Performansı
                    prints. No second vocabulary, no new severity. */}
                <StatusLabel
                  icon={attentionGlyph.icon}
                  tone={attentionGlyph.tone}
                  textStyle={styles.attentionState}
                >
                  {attentionCategoryLabel(attention.category)}
                </StatusLabel>
                {attention.reasons.map((reason) => (
                  <Text key={reason} style={styles.bodyText}>
                    {reason}
                  </Text>
                ))}
              </Card>
            ) : null}

            {/* Phase 124 — the rate is a fact among the others now, not the
                screen's hero. It kept its exact meaning (solved outcomes over
                every recorded outcome — see studentPerformance.ts), its label
                and its honest "—" for a student with no trustworthy history;
                what it lost is the 40pt centred card that made "how good is
                this student" the loudest question on a screen whose job is
                what the evidence actually says. */}
            <Card style={styles.card}>
              <Text style={styles.sectionLabel}>Genel başarı</Text>
              <Text style={styles.bigValueSmall}>
                {snapshot.successRatePercent === null ? "—" : `%${snapshot.successRatePercent}`}
              </Text>
              <Text style={styles.bodyTextMuted}>
                {snapshot.successRatePercent === null
                  ? "Henüz yeterli veri yok"
                  : "kaydedilen sonuçlara göre"}
              </Text>
            </Card>
          </View>

          <View style={styles.group}>
            {/* Phase 32 — the question a teacher opens this screen to answer.
                Placed ABOVE "bugünkü durum" because a student who studied
                Monday–Thursday reads as completely inactive on a Friday if
                "today" is the first thing shown. */}
            <Card style={styles.card}>
              <Text style={styles.sectionLabel}>Bu hafta</Text>
              {snapshot.thisWeek.studiedThisWeek ? (
                <>
                  <Text style={styles.bodyText}>
                    {snapshot.thisWeek.reviewedThisWeek} soru · {snapshot.thisWeek.activeDaysThisWeek} gün
                  </Text>
                  <Text style={styles.bodyTextMuted}>{snapshot.thisWeek.solvedThisWeek} doğru</Text>
                  {snapshot.thisWeek.struggledThisWeek > 0 ? (
                    <Text style={styles.bodyTextDanger}>
                      {snapshot.thisWeek.struggledThisWeek} zorlanılan soru
                    </Text>
                  ) : null}
                </>
              ) : (
                <Text style={styles.bodyTextMuted}>Bu hafta bu sınıfta çalışmadı</Text>
              )}
            </Card>

            <Card style={styles.card}>
              <Text style={styles.sectionLabel}>Bugünkü durum</Text>
              <Text style={styles.bodyText}>{snapshot.today.reviewedToday} soru çözüldü</Text>
              <Text style={styles.bodyTextMuted}>{snapshot.today.solvedToday} doğru</Text>
              {snapshot.today.struggledToday > 0 ? (
                <Text style={styles.bodyTextDanger}>{snapshot.today.struggledToday} zorlanılan soru</Text>
              ) : null}
            </Card>

            <View style={[styles.row, stacked ? styles.rowStacked : null]}>
              <Card style={styles.halfCard}>
                <Text style={styles.sectionLabel}>Tekrar durumu</Text>
                <Text style={styles.bigValueSmall}>{snapshot.dueCount}</Text>
                <Text style={styles.bodyTextMuted}>bekleyen tekrar</Text>
              </Card>
              <Card style={styles.halfCard}>
                <Text style={styles.sectionLabel}>Bu sınıfta aktif gün</Text>
                <Text style={styles.bigValueSmall}>{snapshot.daysActiveRecently}</Text>
                <Text style={styles.bodyTextMuted}>son 14 gün içinde</Text>
              </Card>
            </View>
          </View>

          <View style={styles.group}>
            {/* Phase 60 — chronological CONTEXT, placed between the aggregate
                counts above and the intervention/action machinery below: a
                teacher deciding what to do should see what actually happened,
                in order, before they see the verdict and the button. It is
                context only — Phase 42 remains the authority on the student's
                state, and Phase 47 on the action. */}
            <Card style={styles.card}>
              <Text style={styles.sectionLabel}>Son öğrenme akışı</Text>
              <TeacherLearningTimeline
                timeline={timeline}
                isLoading={isTimelineLoading}
                hasError={hasTimelineError}
              />
            </Card>

            {/* Phase 78 — repeated authored selections, directly under the flow
                they were derived from. Rendered only when a pattern actually
                qualified, so a student without one costs this screen nothing —
                not a card, not a heading, not an empty state. */}
            {choicePatterns.patterns.length > 0 ? (
              <Card style={styles.card}>
                <Text style={styles.sectionLabel}>Tekrarlayan seçim örüntüleri</Text>
                <VerifiedChoicePatternSection
                  intro="Son öğrenme kayıtlarında aynı doğrulanmış seçim anlamı farklı sorularda tekrarlandı."
                  patterns={choicePatterns.patterns}
                  compact
                />
              </Card>
            ) : null}
          </View>

          {(intervention && interventionOutcome) || snapshot.persistentStruggleCount > 0 ? (
            <View style={styles.group}>
              {/* Phase 44 — the result of the LAST intervention, placed directly
                  above the diagnosis that offers to create the next one: a
                  teacher deciding whether to intervene again should first see
                  whether the previous one landed. Rendered only when this
                  student was actually targeted by a delivered assignment. */}
              {intervention && interventionOutcome ? (
                <>
                  <InterventionOutcomeCard result={interventionOutcome} title={intervention.title} />
                  {/* Phase 47 — "şimdi ne yapmalıyım?", right under the verdict
                      that answers "işe yaradı mı?". Same observational tone as
                      the card above it; never a claim about what caused the
                      result. */}
                  {postInterventionAction ? (
                    <Card style={styles.card}>
                      <Text style={styles.sectionLabel}>Sonraki adım</Text>
                      <Text style={styles.bodyText}>{postInterventionAction.reason}</Text>
                    </Card>
                  ) : null}
                </>
              ) : null}

              {/* Phase 42 — the distinction the dashboard could not previously
                  draw: repeated, unresolved struggle on the SAME question vs a
                  handful of one-off slips. Rendered only when there is real
                  evidence; a student whose items all predate the counters shows
                  nothing here rather than a zero. */}
              {snapshot.persistentStruggleCount > 0 ? (
                <Card style={styles.card}>
                  <Text style={styles.sectionLabel}>Tekrarlayan zorlanma</Text>
                  <Text style={styles.bodyTextDanger}>
                    {snapshot.persistentStruggleCount} soruda tekrar tekrar zorlanıyor
                  </Text>
                  {snapshot.maxItemStruggleEvents !== null ? (
                    <Text style={styles.bodyTextMuted}>
                      En çok zorlandığı soruda {snapshot.maxItemStruggleEvents} kez zorlandı
                    </Text>
                  ) : null}
                  {/* Phase 43 — the screen's first action. Diagnosis, the real
                      evidence behind it, and the one thing to do about it, in
                      the same card. Rendered only when a topic is actually
                      resolvable: a persistent struggle on a question whose
                      subject/topic could not be resolved still shows the counts
                      above, but has nothing honest to prefill a composer with. */}
                  {interventionTopic ? (
                    <>
                      <Text style={styles.bodyTextMuted}>
                        {interventionTopic.subject} · {interventionTopic.topic}
                      </Text>
                      {/* Phase 47 §7 — this button used to render unconditionally
                          whenever interventionTopic resolved, which is a LIFETIME
                          signal that never clears even after a student recovers.
                          Suppressed only when a real verdict says so ("monitor"
                          — improved, or evidence too thin to act on); with no
                          verdict at all (postInterventionAction === null), this
                          renders exactly as it always has. */}
                      {!postInterventionAction || postInterventionAction.kind !== "monitor" ? (
                        <PrimaryButton
                          label="Takip Ödevi Oluştur"
                          onPress={openInterventionForStudent}
                          accessibilityHint={`${interventionTopic.topic} konusunda bu öğrenci için ödev oluşturur`}
                        />
                      ) : null}
                    </>
                  ) : null}
                </Card>
              ) : null}
            </View>
          ) : null}

          {snapshot.weakTopics.length > 0 || snapshot.strongTopics.length > 0 ? (
            <View style={styles.group}>
              {snapshot.weakTopics.length > 0 ? (
                <Card style={styles.card}>
                  <Text style={styles.sectionLabel}>Zayıf konular</Text>
                  <View style={styles.chipRow}>
                    {snapshot.weakTopics.map((topic) => (
                      <Chip key={`${topic.subject}-${topic.topic}`} label={topicChipLabel(topic)} />
                    ))}
                  </View>
                </Card>
              ) : null}

              {snapshot.strongTopics.length > 0 ? (
                <Card style={styles.card}>
                  <Text style={styles.sectionLabel}>Güçlü konular</Text>
                  <View style={styles.chipRow}>
                    {snapshot.strongTopics.map((topic) => (
                      <Chip key={`${topic.subject}-${topic.topic}`} label={`${topic.topic} (${topic.subject})`} />
                    ))}
                  </View>
                </Card>
              ) : null}
            </View>
          ) : null}

          <View style={styles.group}>
            <Card style={styles.card}>
              <Text style={styles.sectionLabel}>Son çalışma</Text>
              <Text style={styles.bodyText}>{formatLastStudied(snapshot.lastStudiedAt)}</Text>
            </Card>

            <Card style={styles.card}>
              <Text style={styles.sectionLabel}>Son 14 günlük trend</Text>
              {trendGlyph ? (
                <StatusLabel icon={trendGlyph.icon} tone={trendGlyph.tone} textStyle={styles.bodyText}>
                  {trendLabel(snapshot.trend)}
                </StatusLabel>
              ) : (
                <Text style={styles.bodyText}>{trendLabel(snapshot.trend)}</Text>
              )}
            </Card>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
    // Phase 74 — the reading measure the rest of the product already uses.
    // Applied to the chrome and the scroller alike: capping only the list
    // would have left the back button and title pinned to the window edge
    // while the cards centred under them.
    width: "100%",
    maxWidth: contentWidth.readable,
    alignSelf: "center",
  },
  backButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -spacing.sm,
  },
  // Stacked, the 44pt chevron tops-align with a title that now wraps rather
  // than centring against two or three lines of it.
  headerStacked: {
    alignItems: "flex-start",
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    flex: 1,
  },
  skeletonList: {
    padding: spacing.lg,
    gap: spacing.md,
    width: "100%",
    maxWidth: contentWidth.readable,
    alignSelf: "center",
  },
  // Phase 74 — the cap for a SCROLLING box goes on the element, not on its
  // content container. Capping the content centres it inside the scroller's
  // inner width, which is a few pixels narrower than the screen because the
  // scrollbar lives there — so the list settled slightly left of the header
  // that was centred against the full width. Capping the element puts both
  // boxes on the same measure and leaves the scrollbar at the column's own
  // edge, where a capped page normally puts it.
  scroller: {
    flex: 1,
    width: "100%",
    maxWidth: contentWidth.readable,
    alignSelf: "center",
  },
  content: {
    padding: spacing.lg,
    // Phase 104 (B2) — the gap BETWEEN groups; `group` steps down inside one.
    gap: spacing.lg,
  },
  group: {
    gap: spacing.sm,
  },
  card: {
    gap: spacing.xxs,
  },
  attentionCard: {
    gap: spacing.xxs,
    backgroundColor: colors.surfaceMuted,
    // The tone is supplied per render; only the edge itself lives here. It
    // follows the card's own corner radius rather than squaring it off, so the
    // note still reads as one of the page's cards.
    borderLeftWidth: 3,
  },
  attentionState: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  row: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  // Past the accessibility sizes the two tiles take the width one after the
  // other instead of splitting it and breaking their words in half.
  rowStacked: {
    flexDirection: "column",
  },
  halfCard: {
    flex: 1,
    gap: spacing.xxs,
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.textTertiary,
    textTransform: "uppercase",
  },
  // Phase 103 (D11) — a style that spreads a typography token and then raises
  // `fontSize` keeps the token's ORIGINAL `lineHeight` unless it raises that
  // too, and iOS clamps the line to it: title's 24pt box exactly equalled this
  // 24pt size, leaving no ascender room at all. It escaped notice only because
  // the call sites render plain digits — a "%" or a "Ş" would have been sliced
  // off, which is exactly what happened to the 40pt hero this screen used to
  // draw the success rate with (Phase 124 retired it; see the card above).
  // The line box stays proportional to the size it is actually drawn at.
  bigValueSmall: {
    ...typography.title,
    fontSize: 24,
    lineHeight: 30,
    color: colors.textPrimary,
  },
  bodyText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  bodyTextMuted: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  bodyTextDanger: {
    ...typography.caption,
    color: colors.danger,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
}));
