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

interface CreateAssignmentScreenProps {
  classId: string;
  initialSubject?: string;
  initialTopic?: string;
}

const MAX_TITLE_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 300;
const QUESTION_COUNT_OPTIONS = [5, 10, 15, 20];

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
export function CreateAssignmentScreen({ classId, initialSubject, initialTopic }: CreateAssignmentScreenProps) {
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

  const { create, isCreating, error } = useCreateAssignment({
    classId,
    organizationId,
    teacherId: firebaseUser?.uid,
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
  const [gradeLevel, setGradeLevel] = useState<string>(GRADE_LEVELS[0]);
  const [targetMode, setTargetMode] = useState<TargetStudentMode>("all");
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [questionCount, setQuestionCount] = useState(QUESTION_COUNT_OPTIONS[1] ?? 10);
  const [dueDaysFromNow, setDueDaysFromNow] = useState<number | null>(7);
  const [validationError, setValidationError] = useState<string | null>(null);

  function handleSubjectChange(next: string) {
    setSubject(next);
    const nextTopics = getTopicsForSubject(next);
    if (!nextTopics.includes(topic)) setTopic(nextTopics[0] ?? "");
  }

  function toggleStudent(uid: string) {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  async function handlePublish(status: "draft" | "published") {
    if (title.trim().length === 0) {
      setValidationError("Lütfen bir başlık girin.");
      return;
    }
    setValidationError(null);
    const assignmentId = await create({
      title,
      description: description.trim().length > 0 ? description.trim() : null,
      subject,
      topic,
      gradeLevel,
      targetMode,
      allClassStudentIds: members.map((member) => member.uid),
      selectedStudentIds: [...selectedStudentIds],
      requestedQuestionCount: questionCount,
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
        <ChipRow options={topicOptions} selected={topic} onSelect={setTopic} />

        <Text style={styles.label}>Sınıf Seviyesi</Text>
        <ChipRow options={GRADE_LEVELS} selected={gradeLevel} onSelect={setGradeLevel} />

        <Text style={styles.label}>Soru Sayısı</Text>
        <View style={styles.chipRow}>
          {QUESTION_COUNT_OPTIONS.map((count) => (
            <Chip
              key={count}
              label={String(count)}
              selected={questionCount === count}
              onPress={() => setQuestionCount(count)}
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
          <Chip label="Tüm sınıf" selected={targetMode === "all"} onPress={() => setTargetMode("all")} />
          <Chip label="Öğrenci seç" selected={targetMode === "selected"} onPress={() => setTargetMode("selected")} />
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

        <PrimaryButton label="Yayınla" onPress={() => handlePublish("published")} isLoading={isCreating} />
        <Pressable
          onPress={() => handlePublish("draft")}
          disabled={isCreating}
          style={styles.draftButton}
          accessibilityRole="button"
        >
          <Text style={styles.draftButtonText}>Taslak olarak kaydet</Text>
        </Pressable>
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
