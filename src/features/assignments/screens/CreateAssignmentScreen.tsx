import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Chip } from "@components/ui/Chip";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { useAuth } from "@features/authentication";
import { GRADE_LEVELS, getTopicsForSubject, QUESTION_SUBJECTS } from "@features/questions/data/questionTaxonomy";
import { getClassById, getClassMembers } from "@services/firebase/classes";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { ClassMember } from "@/types/class";

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
  // Phase 44 — true ONLY when this screen was opened from one of the two
  // explicit Phase 43 intervention CTAs (StudentPerformanceScreen's
  // persistent-struggle "Takip Ödevi Oluştur", ClassPerformanceScreen's
  // topic-hotspot targeted assignment). Deliberately a separate, narrow
  // prop rather than inferred from initialTopic/initialTargetStudentIds
  // being present — AssignmentDetailScreen's own (Phase 30/31) follow-up
  // CTA sends those same params for a completely different reason (reacting
  // to one assignment's own weak outcomes, not Phase 42's persistent-struggle
  // classifier) and must NOT be attributed as an intervention.
  isIntervention?: boolean;
}

const MAX_TITLE_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 300;
const QUESTION_COUNT_OPTIONS = [5, 10, 15, 20];

const STRATEGY_OPTIONS: { value: AssignmentSelectionStrategy; label: string }[] = [
  { value: "balanced", label: "Dengeli" },
  { value: "focus", label: "Odaklan" },
  { value: "reinforce", label: "Güçlendir" },
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
export function CreateAssignmentScreen({
  classId,
  initialSubject,
  initialTopic,
  initialGradeLevel,
  initialTargetStudentIds,
  isIntervention,
}: CreateAssignmentScreenProps) {
  const { firebaseUser } = useAuth();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [members, setMembers] = useState<ClassMember[]>([]);
  const [isLoadingContext, setIsLoadingContext] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getClassById(classId), getClassMembers(classId)]).then(([room, roster]) => {
      if (cancelled) return;
      setOrganizationId(room?.organizationId ?? null);
      setMembers(roster.filter((member) => member.role === "student"));
      setIsLoadingContext(false);
    });
    return () => {
      cancelled = true;
    };
  }, [classId]);

  const { prepare, publish, resetPreview, preview, isPreparing, isPublishing, error } = useCreateAssignment({
    classId,
    organizationId,
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
  const [validationError, setValidationError] = useState<string | null>(null);

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

  async function handlePrepare() {
    if (title.trim().length === 0) {
      setValidationError("Lütfen bir başlık girin.");
      return;
    }
    setValidationError(null);
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

  const displayError = validationError ?? error;
  const isBusy = isPreparing || isPublishing;

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
        <View style={styles.skeletonList}>
          <LoadingSkeleton height={48} borderRadius={12} />
          <LoadingSkeleton height={120} borderRadius={12} />
          <LoadingSkeleton height={120} borderRadius={12} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Geri"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Ödev Oluştur</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Başlık</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Örn. Denklemler Tekrarı"
          placeholderTextColor={colors.textTertiary}
          maxLength={MAX_TITLE_LENGTH}
        />

        <Text style={styles.label}>Açıklama (isteğe bağlı)</Text>
        <TextInput
          style={styles.inputMultiline}
          value={description}
          onChangeText={setDescription}
          placeholder="Öğrencilere kısa bir not..."
          placeholderTextColor={colors.textTertiary}
          maxLength={MAX_DESCRIPTION_LENGTH}
          multiline
        />

        <Text style={styles.label}>Ders</Text>
        <ChipRow options={QUESTION_SUBJECTS} selected={subject} onSelect={handleSubjectChange} />

        <Text style={styles.label}>Konu</Text>
        <ChipRow options={topicOptions} selected={topic} onSelect={handleTopicChange} />

        <Text style={styles.label}>Sınıf Seviyesi</Text>
        <ChipRow options={GRADE_LEVELS} selected={gradeLevel} onSelect={handleGradeChange} />

        <Text style={styles.label}>Seçim Stratejisi</Text>
        <View style={styles.chipRow}>
          {STRATEGY_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
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

        {displayError ? <Text style={styles.error}>{displayError}</Text> : null}

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

        {!preview ? (
          <PrimaryButton label="Soruları Hazırla" onPress={handlePrepare} isLoading={isPreparing} />
        ) : (
          <>
            <PrimaryButton label="Yayınla" onPress={() => handlePublish("published")} isLoading={isPublishing} />
            <Pressable
              onPress={() => handlePublish("draft")}
              disabled={isBusy}
              style={styles.draftButton}
              accessibilityRole="button"
            >
              <Text style={styles.draftButtonText}>Taslak olarak kaydet</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
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

const styles = StyleSheet.create({
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
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  backButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -spacing.sm,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  content: {
    padding: spacing.lg,
    paddingTop: 0,
    gap: spacing.xs,
  },
  label: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.xxs,
  },
  input: {
    minHeight: 44,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    fontSize: 15,
    color: colors.textPrimary,
  },
  inputMultiline: {
    minHeight: 70,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: 14,
    color: colors.textPrimary,
    textAlignVertical: "top",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  previewCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
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
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs,
  },
  draftButtonText: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textSecondary,
  },
});
