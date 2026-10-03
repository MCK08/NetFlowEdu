import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppBackButton } from "@components/ui/AppBackButton";
import { Badge } from "@components/ui/Badge";
import { Chip } from "@components/ui/Chip";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { SectionHeader } from "@components/ui/SectionHeader";
import { TextField } from "@components/ui/TextField";
import { useAuth } from "@features/authentication";
import { GRADE_LEVELS, getTopicsForSubject, QUESTION_SUBJECTS } from "@features/questions/data/questionTaxonomy";
import { getClassById, getClassMembers } from "@services/firebase/classes";
import { colors } from "@theme/colors";
import { contentWidth } from "@theme/layout";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { ClassMember, ClassRoom } from "@/types/class";

import { ComposerSteps } from "../components/ComposerSteps";
import { StrategyOptionCard } from "../components/StrategyOptionCard";
import {
  MAX_ASSIGNMENT_DESCRIPTION_LENGTH,
  MAX_ASSIGNMENT_TITLE_LENGTH,
} from "../domain/assignmentTypes";
import { endOfLocalDay } from "../services/assignmentDueDate";
import { useCreateAssignment } from "../hooks/useCreateAssignment";
import { TargetStudentMode } from "../services/assignmentCreation";
import { AssignmentSelectionStrategy } from "../services/smartAssignmentSelection";

interface CreateAssignmentScreenProps {
  classId: string;
  initialSubject?: string;
  initialTopic?: string;
  initialGradeLevel?: string;
  // Phase 31 follow-up flow — comma-joined student uids from the "Takip
  // Ödevi Oluştur" CTA (AssignmentDetailScreen). Same "teacher can still
  // change it" suggestion contract as initialTopic (§12 "DO NOT
  // AUTO-PUBLISH" — this only prefills the form, never submits it).
  initialTargetStudentIds?: string;
  // Phase 44 — true ONLY when this screen was opened from one of the three
  // explicit Phase 43 intervention CTAs (StudentPerformanceScreen's
  // persistent-struggle "Takip Ödevi Oluştur", ClassPerformanceScreen's
  // topic-hotspot targeted assignment, and Phase 81's small-group draft —
  // which is gated on the same resolveTopicInterventionTargets answer as the
  // hotspot one, not on the semantic cohort). Deliberately a separate, narrow
  // prop rather than inferred from initialTopic/initialTargetStudentIds
  // being present — AssignmentDetailScreen's own (Phase 30/31) follow-up
  // CTA sends those same params for a completely different reason (reacting
  // to one assignment's own weak outcomes, not Phase 42's persistent-struggle
  // classifier) and must NOT be attributed as an intervention.
  isIntervention?: boolean;
}

// Phase 127 — the screen's name matches the control that opens it. Class
// Detail's "Sınıf İşleri" offers "Yeni Çalışma Oluştur" (Phase 123) and
// landed on a screen titled "Ödev Oluştur".
export const CREATE_ASSIGNMENT_TITLE = "Yeni Çalışma Oluştur";
export const CREATE_ASSIGNMENT_SUBTITLE = "Öğrencileriniz için yeni bir çalışma hazırlayın.";

/** The two stages this flow really has: fill the form, then confirm the
 *  prepared question set. publish() only ever writes what was previewed. */
export const COMPOSER_STEPS = ["Çalışma Bilgileri", "Önizleme ve Yayın"] as const;

const QUESTION_COUNT_OPTIONS = [5, 10, 15, 20];

// Phase 127 — each line states what the branch in
// selectSmartAssignmentQuestions actually does. "Dengeli" interleaves
// multiple-choice and open-ended questions; "Odaklan" takes the topic's own
// questions in order; "Güçlendir" reads the TARGETED students' own history
// and puts struggled, never-attempted and long-unpractised questions first.
// Nothing here is a promise about outcomes.
const STRATEGY_OPTIONS: {
  value: AssignmentSelectionStrategy;
  label: string;
  description: string;
}[] = [
  { value: "balanced", label: "Dengeli", description: "Çoktan seçmeli ve açık uçlu sorular dönüşümlü" },
  { value: "focus", label: "Odaklan", description: "Yalnızca seçilen konunun soruları" },
  {
    value: "reinforce",
    label: "Güçlendir",
    description: "Öğrencilerin zorlandığı ve uzun süredir çalışmadığı sorular önce",
  },
];

interface DueOption {
  label: string;
  daysFromNow: number | null;
}

const DUE_OPTIONS: DueOption[] = [
  { label: "Yarın", daysFromNow: 1 },
  { label: "3 gün", daysFromNow: 3 },
  { label: "1 hafta", daysFromNow: 7 },
  { label: "Son tarih yok", daysFromNow: null },
];

function dueAtFromOffset(daysFromNow: number | null): number | null {
  if (daysFromNow === null) return null;
  const target = new Date();
  target.setDate(target.getDate() + daysFromNow);
  return endOfLocalDay(target.getFullYear(), target.getMonth() + 1, target.getDate());
}

// Reuses the exact same question-creation taxonomy (QUESTION_SUBJECTS/
// GRADE_LEVELS/getTopicsForSubject) a teacher's own question composer
// already uses — one taxonomy, not a second one for assignments. No date
// picker library exists in this project and none was added (no dependency
// install this phase) — due date selection is a small set of real, useful
// offsets (Chip rows, the same selection pattern already used everywhere
// else in this app), not a full calendar.
//
// Phase 127 — the same fields, the same validation, the same two-stage
// submit; what changed is that the screen now says which class the work is
// for, groups its eight controls into the three things a teacher is
// actually deciding, keeps the keyboard off the field being typed into, and
// puts the title's error under the title. The approved mockup's four-step
// wizard, "Değiştir" class switcher, 60/200 character caps and
// Alıştırmalar / Kısa Sınav / Karma types are all absent: this flow has two
// stages, is bound to one class by its route, caps at 80/300
// (assignmentTypes.ts, mirrored in firestore.rules) and has three real
// selection strategies whose names are their own.
export function CreateAssignmentScreen({
  classId,
  initialSubject,
  initialTopic,
  initialGradeLevel,
  initialTargetStudentIds,
  isIntervention,
}: CreateAssignmentScreenProps) {
  useThemeSubscription();
  const { firebaseUser } = useAuth();
  // Phase 127 — the class document this screen was already reading for its
  // organizationId, kept whole so the teacher can see which class the work
  // is for. Same one read; nothing new is fetched.
  const [classRoom, setClassRoom] = useState<ClassRoom | null>(null);
  const [members, setMembers] = useState<ClassMember[]>([]);
  const [isLoadingContext, setIsLoadingContext] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getClassById(classId), getClassMembers(classId)]).then(([room, roster]) => {
      if (cancelled) return;
      setClassRoom(room);
      setMembers(roster.filter((member) => member.role === "student"));
      setIsLoadingContext(false);
    });
    return () => {
      cancelled = true;
    };
  }, [classId]);

  const { prepare, publish, resetPreview, preview, isPreparing, isPublishing, error } = useCreateAssignment({
    classId,
    organizationId: classRoom?.organizationId ?? null,
    teacherId: firebaseUser?.uid,
    isIntervention,
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subject, setSubject] = useState(
    initialSubject && (QUESTION_SUBJECTS as readonly string[]).includes(initialSubject)
      ? initialSubject
      : QUESTION_SUBJECTS[0],
  );
  const topicOptions = useMemo(() => getTopicsForSubject(subject), [subject]);
  const [topic, setTopic] = useState(
    initialTopic && topicOptions.includes(initialTopic) ? initialTopic : topicOptions[0] ?? "",
  );
  const [gradeLevel, setGradeLevel] = useState<string>(
    initialGradeLevel && (GRADE_LEVELS as readonly string[]).includes(initialGradeLevel)
      ? initialGradeLevel
      : GRADE_LEVELS[0],
  );
  const prefilledStudentIds = useMemo(
    () => (initialTargetStudentIds ? initialTargetStudentIds.split(",").filter((id) => id.length > 0) : []),
    [initialTargetStudentIds],
  );
  const [targetMode, setTargetMode] = useState<TargetStudentMode>(
    prefilledStudentIds.length > 0 ? "selected" : "all",
  );
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set(prefilledStudentIds));
  const [questionCount, setQuestionCount] = useState(QUESTION_COUNT_OPTIONS[1] ?? 10);
  const [dueDaysFromNow, setDueDaysFromNow] = useState<number | null>(7);
  // Arriving from a Topic Hotspot (a real class-wide struggle signal
  // already established, see classTopicInsights.ts) defaults to
  // "reinforce" — the teacher can still change it; this is a suggestion,
  // not a lock, matching every other prefill in this app (§10).
  const [strategy, setStrategy] = useState<AssignmentSelectionStrategy>(
    initialTopic ? "reinforce" : "balanced",
  );
  // Phase 127 — the title's own error, shown under the title. It used to be
  // one centred line at the foot of a long scroll, below everything it was
  // about.
  const [titleError, setTitleError] = useState<string | null>(null);

  // Any change to a field that affects WHICH questions get selected
  // invalidates a previously-generated preview — publish() only ever
  // writes the exact snapshot the teacher last previewed (§14), so an
  // edit after preview must force a fresh "Soruları Hazırla" tap rather
  // than silently publishing a stale or mismatched set.
  function invalidatePreview() {
    if (preview) resetPreview();
  }

  function handleSubjectChange(next: string) {
    setSubject(next);
    const nextTopics = getTopicsForSubject(next);
    if (!nextTopics.includes(topic)) setTopic(nextTopics[0] ?? "");
    invalidatePreview();
  }

  function handleTopicChange(next: string) {
    setTopic(next);
    invalidatePreview();
  }

  function handleGradeChange(next: string) {
    setGradeLevel(next);
    invalidatePreview();
  }

  function handleStrategyChange(next: AssignmentSelectionStrategy) {
    setStrategy(next);
    invalidatePreview();
  }

  function handleQuestionCountChange(next: number) {
    setQuestionCount(next);
    invalidatePreview();
  }

  function handleTargetModeChange(next: TargetStudentMode) {
    setTargetMode(next);
    invalidatePreview();
  }

  function toggleStudent(uid: string) {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
    invalidatePreview();
  }

  // Phase 127 — the title change clears its own error as soon as the teacher
  // starts fixing it, and nothing else in the form is touched: a failed
  // validation never costs typed work.
  function handleTitleChange(next: string) {
    setTitle(next);
    if (titleError && next.trim().length > 0) setTitleError(null);
  }

  async function handlePrepare() {
    if (title.trim().length === 0) {
      setTitleError("Lütfen bir başlık girin.");
      return;
    }
    setTitleError(null);
    await prepare({
      subject,
      topic,
      gradeLevel,
      targetMode,
      allClassStudentIds: members.map((member) => member.uid),
      selectedStudentIds: [...selectedStudentIds],
      requestedQuestionCount: questionCount,
      strategy,
    });
  }

  async function handlePublish(status: "draft" | "published") {
    const assignmentId = await publish({
      title,
      description: description.trim().length > 0 ? description.trim() : null,
      dueAt: dueAtFromOffset(dueDaysFromNow),
      status,
    });
    if (assignmentId) {
      router.replace({
        pathname: "/(teacher)/class/[classId]/assignment/[assignmentId]",
        params: { classId, assignmentId },
      });
    }
  }

  const isBusy = isPreparing || isPublishing;
  const stepIndex = preview ? 1 : 0;

  const reasonCounts = useMemo(() => {
    if (!preview) return [];
    const counts = new Map<string, number>();
    for (const entry of preview.selected) {
      counts.set(entry.reasonLabel, (counts.get(entry.reasonLabel) ?? 0) + 1);
    }
    return [...counts.entries()];
  }, [preview]);
  const mcCount = useMemo(
    () => (preview ? preview.selected.filter((entry) => entry.isMultipleChoice).length : 0),
    [preview],
  );

  if (isLoadingContext) {
    return (
      <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
        <View style={styles.skeletonList} accessible accessibilityLabel="Çalışma oluşturma ekranı yükleniyor">
          <LoadingSkeleton height={48} borderRadius={radius.md} />
          <LoadingSkeleton height={120} borderRadius={radius.md} />
          <LoadingSkeleton height={120} borderRadius={radius.md} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      {/* Phase 127 — without this the keyboard covered the field being typed
          into and the screen's only CTA on a phone. */}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <AppBackButton
            fallbackHref={{ pathname: "/(teacher)/class/[classId]", params: { classId } }}
            style={styles.backButton}
          />
          <View style={styles.headerText}>
            <Text style={styles.title} accessibilityRole="header">
              {CREATE_ASSIGNMENT_TITLE}
            </Text>
            <Text style={styles.subtitle}>{CREATE_ASSIGNMENT_SUBTITLE}</Text>
          </View>
        </View>

        <ScrollView
          style={styles.scroller}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ComposerSteps steps={COMPOSER_STEPS} activeIndex={stepIndex} />

          {/* WHICH CLASS — the document this screen already read. There is no
              "Değiştir": the composer is bound to the class in its own route,
              and every entry point opens it for one class. */}
          {classRoom ? (
            <View
              style={styles.classCard}
              accessible
              accessibilityLabel={`Sınıf: ${classRoom.name}. ${members.length} öğrenci.${classRoom.status !== "active" ? " Arşivlendi." : ""}`}
            >
              <View style={styles.classIcon}>
                {/* Decorative: the card's own label names the class. */}
                <Ionicons name="people" size={iconSize.sm} color={colors.primary} accessibilityElementsHidden />
              </View>
              <View style={styles.classText}>
                <Text style={styles.classLabel}>Sınıf</Text>
                <Text style={styles.className}>{classRoom.name}</Text>
                <Text style={styles.classMeta}>{members.length} öğrenci</Text>
              </View>
              {classRoom.status !== "active" ? <Badge label="Arşivlendi" variant="neutral" /> : null}
            </View>
          ) : null}

          <View style={styles.section}>
            <SectionHeader title="Temel Bilgiler" />
            <TextField
              label="Çalışma Başlığı"
              value={title}
              onChangeText={handleTitleChange}
              placeholder="Örn. Denklemler Tekrarı"
              maxLength={MAX_ASSIGNMENT_TITLE_LENGTH}
              errorMessage={titleError ?? undefined}
              accessibilityHint={`Zorunlu alan. En fazla ${MAX_ASSIGNMENT_TITLE_LENGTH} karakter.`}
              returnKeyType="next"
            />
            <Text style={styles.counter}>
              {title.length}/{MAX_ASSIGNMENT_TITLE_LENGTH}
            </Text>

            <TextField
              label="Açıklama (isteğe bağlı)"
              value={description}
              onChangeText={setDescription}
              placeholder="Öğrencilere kısa bir not..."
              maxLength={MAX_ASSIGNMENT_DESCRIPTION_LENGTH}
              accessibilityHint={`İsteğe bağlı. En fazla ${MAX_ASSIGNMENT_DESCRIPTION_LENGTH} karakter.`}
              multiline
              style={styles.multiline}
            />
            <Text style={styles.counter}>
              {description.length}/{MAX_ASSIGNMENT_DESCRIPTION_LENGTH}
            </Text>
          </View>

          <View style={styles.section}>
            <SectionHeader title="Konu" />
            <Text style={styles.help}>Sorular bu ders, konu ve sınıf seviyesinden seçilir.</Text>

            <Text style={styles.label}>Ders</Text>
            <ChipRow options={QUESTION_SUBJECTS} selected={subject} onSelect={handleSubjectChange} />

            <Text style={styles.label}>Konu</Text>
            <ChipRow options={topicOptions} selected={topic} onSelect={handleTopicChange} />

            <Text style={styles.label}>Sınıf Seviyesi</Text>
            <ChipRow options={GRADE_LEVELS} selected={gradeLevel} onSelect={handleGradeChange} />
          </View>

          <View style={styles.section}>
            <SectionHeader title="Çalışma Ayarları" />

            <Text style={styles.label}>Seçim Stratejisi</Text>
            <View style={styles.strategyList} accessibilityRole="radiogroup">
              {STRATEGY_OPTIONS.map((option) => (
                <StrategyOptionCard
                  key={option.value}
                  label={option.label}
                  description={option.description}
                  selected={strategy === option.value}
                  onPress={() => handleStrategyChange(option.value)}
                />
              ))}
            </View>

            <Text style={styles.label}>Soru Sayısı</Text>
            <View style={styles.chipRow}>
              {QUESTION_COUNT_OPTIONS.map((count) => (
                <Chip
                  key={count}
                  label={String(count)}
                  selected={questionCount === count}
                  onPress={() => handleQuestionCountChange(count)}
                />
              ))}
            </View>

            <Text style={styles.label}>Son Tarih</Text>
            <View style={styles.chipRow}>
              {DUE_OPTIONS.map((option) => (
                <Chip
                  key={option.label}
                  label={option.label}
                  selected={dueDaysFromNow === option.daysFromNow}
                  onPress={() => setDueDaysFromNow(option.daysFromNow)}
                />
              ))}
            </View>

            <Text style={styles.label}>Öğrenciler</Text>
            <View style={styles.chipRow}>
              <Chip label="Tüm sınıf" selected={targetMode === "all"} onPress={() => handleTargetModeChange("all")} />
              <Chip
                label="Öğrenci seç"
                selected={targetMode === "selected"}
                onPress={() => handleTargetModeChange("selected")}
              />
            </View>
            {targetMode === "selected" ? (
              <View style={styles.chipRow}>
                {members.map((member) => (
                  <Chip
                    key={member.uid}
                    label={member.displayName}
                    selected={selectedStudentIds.has(member.uid)}
                    onPress={() => toggleStudent(member.uid)}
                  />
                ))}
              </View>
            ) : null}
          </View>

          {/* The prepared set, before anything is written. */}
          {preview ? (
            <View style={styles.previewCard}>
              <Text style={styles.previewTitle}>
                {preview.selected.length} soru hazırlandı
                {preview.selected.length < questionCount
                  ? ` (bu kriterlerle yalnızca ${preview.selected.length} soru bulundu)`
                  : ""}
              </Text>
              {reasonCounts.map(([label, count]) => (
                <Text key={label} style={styles.previewLine}>
                  {count} · {label}
                </Text>
              ))}
              {mcCount > 0 ? <Text style={styles.previewLine}>{mcCount} · Çoktan seçmeli</Text> : null}
            </View>
          ) : null}

          {/* The server's own words, next to the action that produced them.
              A failed publish never clears the form. */}
          {error ? (
            <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}

          {!preview ? (
            <PrimaryButton
              label="Soruları Hazırla"
              onPress={handlePrepare}
              isLoading={isPreparing}
              accessibilityHint="Seçtiğin kriterlere uyan soruları hazırlar; henüz kimseye gönderilmez"
            />
          ) : (
            <>
              <PrimaryButton
                label="Yayınla"
                onPress={() => handlePublish("published")}
                isLoading={isPublishing}
                disabled={isBusy}
                accessibilityHint="Çalışmayı öğrencilere gönderir"
              />
              <Pressable
                onPress={() => handlePublish("draft")}
                disabled={isBusy}
                style={styles.draftButton}
                accessibilityRole="button"
                accessibilityLabel="Taslak olarak kaydet"
                accessibilityHint="Çalışmayı kaydeder; öğrencilere gönderilmez"
                accessibilityState={{ disabled: isBusy }}
              >
                <Text style={styles.draftButtonText}>Taslak olarak kaydet</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ChipRow({
  options,
  selected,
  onSelect,
}: {
  options: readonly string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((option) => (
        <Chip key={option} label={option} selected={option === selected} onPress={() => onSelect(option)} />
      ))}
    </View>
  );
}

const styles = themedStyles(() => ({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  skeletonList: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
    width: "100%",
    maxWidth: contentWidth.readable,
    alignSelf: "center",
  },
  backButton: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -spacing.sm,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    // The back button is 44pt tall and the title sits beside it; this keeps
    // their first lines on the same baseline once the title wraps.
    paddingTop: spacing.xs,
    gap: 2,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  scroller: {
    flex: 1,
    width: "100%",
    maxWidth: contentWidth.readable,
    alignSelf: "center",
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  section: {
    gap: spacing.xs,
  },
  classCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  classIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryMuted,
  },
  classText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  classLabel: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  className: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  classMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  label: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  help: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  counter: {
    ...typography.caption,
    color: colors.textTertiary,
    alignSelf: "flex-end",
  },
  multiline: {
    minHeight: 96,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
    textAlignVertical: "top",
  },
  strategyList: {
    gap: spacing.xs,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  error: {
    ...typography.body,
    color: colors.danger,
  },
  previewCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 2,
  },
  previewTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  previewLine: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  draftButton: {
    minHeight: minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  draftButtonText: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textSecondary,
  },
}));
