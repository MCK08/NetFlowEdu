import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Chip } from "@components/ui/Chip";
import { EmptyState } from "@components/ui/EmptyState";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { SearchInput } from "@components/ui/SearchInput";
import { colors } from "@theme/colors";
import { contentWidth } from "@theme/layout";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

import { SemanticDefinitionDetail } from "../components/SemanticDefinitionDetail";
import { SemanticDefinitionRow } from "../components/SemanticDefinitionRow";
import { useClassSemanticVocabulary } from "../hooks/useClassSemanticVocabulary";
import { useClassSemanticEvidence } from "../hooks/useClassSemanticEvidence";
import {
  buildSemanticDefinitionTimeline,
  scopedIdentityForDefinition,
} from "../services/semanticDefinitionTimeline";
import { useClassStudentRoster } from "../hooks/useClassStudentRoster";
import {
  buildSemanticDefinitionEvidenceIndex,
  emptyDefinitionEvidence,
  evidenceForDefinition,
} from "../services/semanticDefinitionEvidence";
import { EvidenceLoadState } from "../components/SemanticDefinitionEvidenceSection";
import {
  ARCHIVED_EXPLANATION,
  boundedInventoryNote,
  filterCoverage,
  SemanticDefinitionCoverage,
  vocabularyAbsenceCopy,
  vocabularySubjects,
  vocabularyTopics,
} from "../services/semanticDefinitionCoverage";

// Phase 82 — "Ortak Etiketler".
//
// A calm authoring studio, not an admin console. The vocabulary a teacher
// deliberately built is now infrastructure that shapes authoring, individual
// evidence and class cohorts, so it deserves a surface where they can see it
// whole, find one, understand where it is used, and change its wording without
// wondering what they just broke.
//
// WHAT THE LAYOUT IS DOING
//
// Wide: library on the left, the selected label on the right, because the whole
// task is comparing one entry against its neighbours — a push/pop stack would
// hide exactly the context that makes a rename decision safe.
// Narrow: the same two views, one at a time, with the detail replacing the list.
//
// No table, no grid of metric cards, no chart. Every number here is a count of
// questions and reads as one.

const WIDE_BREAKPOINT = 900;
const LIBRARY_WIDTH = 360;

interface SemanticVocabularyScreenProps {
  classId: string;
}

export function SemanticVocabularyScreen({ classId }: SemanticVocabularyScreenProps) {
  useThemeSubscription();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;

  const { vocabulary, questionsById, isLoading, error, refresh, rename, setArchived } =
    useClassSemanticVocabulary(classId);

  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const subjects = useMemo(() => vocabularySubjects(vocabulary), [vocabulary]);
  const topics = useMemo(() => vocabularyTopics(vocabulary, subject), [vocabulary, subject]);

  const filter = useMemo(() => ({ search, subject, topic }), [search, subject, topic]);
  const activeEntries = useMemo(
    () => filterCoverage(vocabulary.active, filter),
    [vocabulary.active, filter],
  );
  const archivedEntries = useMemo(
    () => filterCoverage(vocabulary.archived, filter),
    [vocabulary.archived, filter],
  );

  // Phase 83 — the class evidence index, loaded LAZILY and ONCE.
  //
  // The library and its question coverage render first, exactly as Phase 82
  // shipped them; nothing about the class roster or any student's events is
  // read until a definition is actually selected. From that moment the roster
  // (one query) and the bounded per-student event fan-out run once for this
  // mount, and every later definition switch is a lookup into the index in
  // memory — zero further reads. See useClassSemanticEvidence for the cost.
  const wantsEvidence = selectedId !== null;
  const roster = useClassStudentRoster(classId, wantsEvidence);
  const classEvidence = useClassSemanticEvidence({
    classId,
    students: roster.students,
    enabled: wantsEvidence && roster.hasLoaded,
  });
  const evidenceIndex = useMemo(
    () => buildSemanticDefinitionEvidenceIndex({ classId, students: classEvidence.evidence }),
    [classId, classEvidence.evidence],
  );
  const evidenceLoadState: EvidenceLoadState = !wantsEvidence
    ? "idle"
    : roster.hasError || classEvidence.hasError
      ? "error"
      : roster.isLoading || classEvidence.isLoading || !classEvidence.hasLoaded
        ? "loading"
        : "ready";
  const retryEvidence = useCallback(() => {
    if (roster.hasError) roster.refresh();
    else classEvidence.refresh();
  }, [roster, classEvidence]);

  // Resolved from the live vocabulary rather than held as a copy, so a rename
  // or an archive is reflected here the moment the hook's state updates.
  const selected: SemanticDefinitionCoverage | null = useMemo(() => {
    if (!selectedId) return null;
    return (
      [...vocabulary.active, ...vocabulary.archived].find(
        (entry) => entry.definition.id === selectedId,
      ) ?? null
    );
  }, [selectedId, vocabulary]);

  const selectSubject = useCallback((value: string | null) => {
    setSubject(value);
    // A topic from the previous subject would filter everything away and read
    // as "no results" rather than as a stale filter.
    setTopic(null);
  }, []);

  const clearSelection = useCallback(() => setSelectedId(null), []);

  const boundedNote = boundedInventoryNote(vocabulary);
  const absence = vocabularyAbsenceCopy(vocabulary);
  const nothingMatches = activeEntries.length === 0 && archivedEntries.length === 0;

  const library = (
    <ScrollView
      style={styles.libraryScroller}
      contentContainerStyle={styles.libraryContent}
      keyboardShouldPersistTaps="handled"
    >
      <SearchInput
        placeholder="Etiket ara"
        value={search}
        onChangeText={setSearch}
        accessibilityLabel="Ortak etiketlerde ara"
      />

      {subjects.length > 1 ? (
        <View style={styles.filterRow}>
          <Chip label="Tüm dersler" selected={subject === null} onPress={() => selectSubject(null)} />
          {subjects.map((value) => (
            <Chip
              key={value}
              label={value}
              selected={subject === value}
              onPress={() => selectSubject(value)}
            />
          ))}
        </View>
      ) : null}

      {topics.length > 1 ? (
        <View style={styles.filterRow}>
          <Chip label="Tüm konular" selected={topic === null} onPress={() => setTopic(null)} />
          {topics.map((value) => (
            <Chip
              key={value}
              label={value}
              selected={topic === value}
              onPress={() => setTopic(value)}
            />
          ))}
        </View>
      ) : null}

      {boundedNote ? <Text style={styles.boundedNote}>{boundedNote}</Text> : null}

      {nothingMatches ? (
        <View style={styles.stateBox}>
          <EmptyState icon="pricetags-outline" title={absence.title} description={absence.description} />
        </View>
      ) : (
        <>
          {activeEntries.map((entry) => (
            <SemanticDefinitionRow
              key={entry.definition.id}
              entry={entry}
              isBounded={vocabulary.isBounded}
              isSelected={entry.definition.id === selectedId}
              onSelect={setSelectedId}
            />
          ))}

          {archivedEntries.length > 0 ? (
            <View style={styles.archivedBlock}>
              <Pressable
                onPress={() => setShowArchived((current) => !current)}
                style={styles.archivedToggle}
                accessibilityRole="button"
                accessibilityLabel={`Arşivlenen etiketler, ${archivedEntries.length} adet. ${
                  showArchived ? "Genişletildi." : "Genişletmek için seçin."
                }`}
                aria-expanded={showArchived}
              >
                <Ionicons name="archive-outline" size={iconSize.sm} color={colors.textSecondary} />
                <Text style={styles.archivedToggleLabel}>
                  {`Arşivlenenler (${archivedEntries.length})`}
                </Text>
                <Ionicons
                  name={showArchived ? "chevron-up" : "chevron-down"}
                  size={iconSize.sm}
                  color={colors.textTertiary}
                />
              </Pressable>
              {showArchived ? (
                <>
                  <Text style={styles.archivedExplanation}>{ARCHIVED_EXPLANATION}</Text>
                  {archivedEntries.map((entry) => (
                    <SemanticDefinitionRow
                      key={entry.definition.id}
                      entry={entry}
                      isBounded={vocabulary.isBounded}
                      isSelected={entry.definition.id === selectedId}
                      onSelect={setSelectedId}
                    />
                  ))}
                </>
              ) : null}
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );

  // Looked up by the definition's OPAQUE id and its own scope — never by label,
  // so two definitions that read the same never share a trail.
  const selectedEvidence = useMemo(
    () =>
      selected
        ? evidenceForDefinition(evidenceIndex, selected.definition)
        : emptyDefinitionEvidence({ id: "", subject: "", topic: "" }),
    [evidenceIndex, selected],
  );

  // Phase 84 — the chronology for the selected definition, derived from the
  // SAME class evidence Phase 83 already loaded. Selecting or switching a
  // definition recomputes this in memory; it triggers no roster query, no
  // student-event query and no question read.
  const selectedTimeline = useMemo(
    () =>
      buildSemanticDefinitionTimeline({
        scoped: scopedIdentityForDefinition({
          classId,
          definitionId: selected?.definition.id ?? "",
          subject: selected?.definition.subject ?? "",
          topic: selected?.definition.topic ?? "",
        }),
        students: classEvidence.evidence,
      }),
    [classId, selected, classEvidence.evidence],
  );

  function openStudent(studentUid: string) {
    const name = roster.students.find((s) => s.studentUid === studentUid)?.displayName ?? "";
    router.push({
      pathname: "/(teacher)/class/[classId]/student/[studentId]",
      params: { classId, studentId: studentUid, studentName: name },
    });
  }

  // The existing Class Performance route, where Phase 81's cohort section
  // lives. No cohort deep-link exists today, and none is invented here.
  function openClassPattern() {
    router.push({ pathname: "/(teacher)/class/[classId]/performance", params: { classId } });
  }

  const detail = selected ? (
    <SemanticDefinitionDetail
      entry={selected}
      isBounded={vocabulary.isBounded}
      onRename={rename}
      onSetArchived={setArchived}
      questionsById={questionsById}
      onClose={isWide ? undefined : clearSelection}
      evidence={selectedEvidence}
      timeline={selectedTimeline}
      evidenceLoadState={evidenceLoadState}
      examinedStudentCount={evidenceIndex.examinedStudentCount}
      onRetryEvidence={retryEvidence}
      onOpenStudent={openStudent}
      onOpenClassPattern={openClassPattern}
    />
  ) : (
    <View style={styles.detailPlaceholder}>
      <EmptyState
        icon="pricetag-outline"
        title="Bir etiket seçin"
        description="Soldaki listeden bir ortak etiket seçtiğinizde, nerede kullanıldığını görebilir ve adını düzenleyebilirsiniz."
      />
    </View>
  );

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
        <View style={styles.headerText}>
          <Text style={styles.title}>Ortak Etiketler</Text>
          <Text style={styles.subtitle}>
            Sınıfta yeniden kullanılan anlam etiketlerini yönetin ve hangi sorularda
            kullanıldıklarını görün.
          </Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.skeletonList}>
          <LoadingSkeleton height={44} borderRadius={12} />
          <LoadingSkeleton height={72} borderRadius={12} />
          <LoadingSkeleton height={72} borderRadius={12} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <EmptyState icon="cloud-offline-outline" title={error} />
          <PrimaryButton label="Tekrar Dene" onPress={refresh} />
        </View>
      ) : isWide ? (
        <View style={styles.wideLayout}>
          <View style={styles.libraryPane}>{library}</View>
          <View style={styles.detailPane}>{detail}</View>
        </View>
      ) : selected ? (
        <View style={styles.narrowDetail}>{detail}</View>
      ) : (
        <View style={styles.narrowLibrary}>{library}</View>
      )}
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    width: "100%" as const,
    maxWidth: contentWidth.readable,
    alignSelf: "center" as const,
  },
  backButton: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginLeft: -spacing.xs,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typography.screenTitle,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  wideLayout: {
    flex: 1,
    flexDirection: "row" as const,
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  libraryPane: {
    width: LIBRARY_WIDTH,
  },
  detailPane: {
    flex: 1,
    maxWidth: contentWidth.readable,
  },
  narrowLibrary: {
    flex: 1,
    width: "100%" as const,
    maxWidth: contentWidth.readable,
    alignSelf: "center" as const,
  },
  narrowDetail: {
    flex: 1,
    width: "100%" as const,
    maxWidth: contentWidth.readable,
    alignSelf: "center" as const,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  libraryScroller: {
    flex: 1,
  },
  libraryContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.xs,
  },
  filterRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: spacing.xxs,
  },
  boundedNote: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  stateBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    marginTop: spacing.xs,
  },
  archivedBlock: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  archivedToggle: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: spacing.xs,
    minHeight: minTouchTarget,
  },
  archivedToggleLabel: {
    ...typography.bodyStrong,
    color: colors.textSecondary,
    flex: 1,
  },
  archivedExplanation: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  detailPlaceholder: {
    flex: 1,
    justifyContent: "center" as const,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skeletonList: {
    padding: spacing.md,
    gap: spacing.sm,
    width: "100%" as const,
    maxWidth: contentWidth.readable,
    alignSelf: "center" as const,
  },
  centered: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: spacing.md,
    padding: spacing.lg,
  },
}));
