import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";
import { formatRelativeTime } from "@utils/feedFormat";
import { joinSpokenLabel } from "@utils/spokenLabel";

import {
  BOUNDED_WINDOW_NOTE,
  cohortStatusLine,
  coverageVersusEvidenceLine,
  DefinitionStudentEvidence,
  EVIDENCE_SECTION_TITLE,
  MAX_INITIAL_EVIDENCE_STUDENTS,
  recoveryLine,
  SemanticDefinitionEvidence,
  studentBreadthLine,
  studentEvidenceStateLabel,
  supportingQuestionsLine,
  verifiedStudentsLine,
} from "../services/semanticDefinitionEvidence";

// Phase 83 — the verified learning evidence around ONE shared definition, as
// an evidence thread inside the definition's own detail.
//
// WHAT IT IS
//
// A notebook page: the definition at the top, a thread running down from it,
// and along that thread the facts — how many questions carry it, who
// independently repeated it, on how many questions, who has since declined
// it. Every line is a count of real records inside a bounded window.
//
// WHAT IT IS NOT
//
// Not an action center. There is no "intervene" here, no group draft and no
// eligibility state — Phase 81 owns evidence-gated intervention and this
// section only offers the existing surfaces to inspect a student or the class
// pattern. Not a dashboard: no gauge, no percentage, no red. And not a
// verdict: "Tekrar eden örüntü" describes selections that happened; it never
// describes the person.
//
// THE THREAD, NOT COLOUR
//
// State is carried by shape and words — a filled ring for a still-repeating
// pattern, an open dashed ring for a recovery signal, the same convention the
// class cohort section already uses — so it survives greyscale and a screen
// reader. The rail is decorative and hidden from assistive tech; the text
// beside it is what gets announced.

export type EvidenceLoadState = "idle" | "loading" | "error" | "ready";

interface SemanticDefinitionEvidenceSectionProps {
  evidence: SemanticDefinitionEvidence;
  /** Phase 82's authored coverage for the same definition — a DIFFERENT number,
   *  shown beside the evidence so neither can be read as the other. */
  coverageQuestionCount: number;
  loadState: EvidenceLoadState;
  /** How many students' histories were examined, so zero reads as "of N". */
  examinedStudentCount: number;
  onRetry: () => void;
  onOpenStudent: (studentUid: string) => void;
  /** Present only when the caller can route to the class-pattern surface. */
  onOpenClassPattern?: () => void;
  now?: number;
}

const MARKER_SIZE = 22;
const RAIL_WIDTH = 1;

export const SemanticDefinitionEvidenceSection = memo(function SemanticDefinitionEvidenceSection({
  evidence,
  coverageQuestionCount,
  loadState,
  examinedStudentCount,
  onRetry,
  onOpenStudent,
  onOpenClassPattern,
  now = Date.now(),
}: SemanticDefinitionEvidenceSectionProps) {
  useThemeSubscription();
  const [showAll, setShowAll] = useState(false);

  // A new definition is a new page — fold the list again.
  useEffect(() => {
    setShowAll(false);
  }, [evidence.definitionId]);

  const toggleAll = useCallback(() => setShowAll((current) => !current), []);

  const students = evidence.students;
  const visible = showAll ? students : students.slice(0, MAX_INITIAL_EVIDENCE_STUDENTS);
  const hidden = students.length - visible.length;

  return (
    <View style={styles.section} accessibilityRole="summary">
      <Text style={styles.title} accessibilityRole="header">
        {EVIDENCE_SECTION_TITLE}
      </Text>
      {/* Said before any number, so no count below can be read as lifetime. */}
      <Text style={styles.windowNote}>{BOUNDED_WINDOW_NOTE}</Text>

      {loadState === "loading" ? (
        <View style={styles.stateBox} accessibilityLiveRegion="polite" accessibilityLabel="Öğrenme kanıtı yükleniyor">
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateText}>Son öğrenme kayıtları okunuyor…</Text>
        </View>
      ) : loadState === "error" ? (
        <View style={styles.stateBox} accessibilityLiveRegion="polite">
          <Ionicons name="cloud-offline-outline" size={iconSize.sm} color={colors.textSecondary} />
          <Text style={styles.stateText}>Öğrenme kayıtları yüklenemedi.</Text>
          <Pressable
            onPress={onRetry}
            style={styles.retry}
            accessibilityRole="button"
            accessibilityLabel="Öğrenme kanıtını tekrar yükle"
          >
            <Text style={styles.retryLabel}>Tekrar dene</Text>
          </Pressable>
        </View>
      ) : loadState === "idle" ? null : (
        <View style={styles.thread}>
          {/* The rail: one vertical line the facts hang from. Decorative. */}
          <View style={styles.rail} importantForAccessibility="no-hide-descendants" />

          {/* Coverage vs evidence — two numbers on one line, named apart. */}
          <ThreadRow icon="pricetag-outline" label={coverageVersusEvidenceLine({ coverageQuestionCount, evidence })} />

          <ThreadRow
            icon={evidence.verifiedStudentCount === 0 ? "ellipse-outline" : "people-outline"}
            label={verifiedStudentsLine(evidence)}
            emphasis={evidence.verifiedStudentCount > 0}
            trailing={
              evidence.verifiedStudentCount === 0 && examinedStudentCount > 0
                ? `${examinedStudentCount} öğrencinin kayıtları incelendi.`
                : null
            }
          />

          {supportingQuestionsLine(evidence) ? (
            <ThreadRow icon="git-branch-outline" label={supportingQuestionsLine(evidence)!} />
          ) : null}

          {recoveryLine(evidence) ? (
            <ThreadRow icon="arrow-undo-outline" label={recoveryLine(evidence)!} />
          ) : null}

          {cohortStatusLine(evidence) ? (
            <ThreadRow
              icon={evidence.classCohortQualified ? "layers-outline" : "person-outline"}
              label={cohortStatusLine(evidence)!}
            />
          ) : null}

          {students.length > 0 ? (
            <View style={styles.students}>
              {visible.map((student) => (
                <StudentRow key={student.studentUid} student={student} now={now} onOpen={onOpenStudent} />
              ))}
              {hidden > 0 || showAll ? (
                <Pressable
                  onPress={toggleAll}
                  style={styles.showAll}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showAll }}
                  accessibilityLabel={showAll ? "Daha az öğrenci göster" : `${hidden} öğrenci daha, tümünü göster`}
                >
                  <Text style={styles.showAllLabel}>
                    {showAll ? "Daha az göster" : `Tümünü göster (${hidden} daha)`}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {evidence.classCohortQualified && onOpenClassPattern ? (
            <Pressable
              onPress={onOpenClassPattern}
              style={styles.classLink}
              accessibilityRole="link"
              accessibilityLabel="Sınıf örüntüsünde incele"
            >
              <Ionicons name="open-outline" size={iconSize.xs} color={colors.primary} />
              <Text style={styles.classLinkLabel}>Sınıf örüntüsünde incele</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
});

function ThreadRow({
  icon,
  label,
  emphasis = false,
  trailing = null,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  emphasis?: boolean;
  trailing?: string | null;
}) {
  return (
    <View style={styles.row} accessible accessibilityLabel={joinSpokenLabel([label, trailing])}>
      <View style={styles.node} importantForAccessibility="no-hide-descendants">
        <Ionicons name={icon} size={iconSize.xs} color={emphasis ? colors.primary : colors.textSecondary} />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowText, emphasis ? styles.rowTextEmphasis : null]}>{label}</Text>
        {trailing ? <Text style={styles.rowTrailing}>{trailing}</Text> : null}
      </View>
    </View>
  );
}

function StudentRow({
  student,
  now,
  onOpen,
}: {
  student: DefinitionStudentEvidence;
  now: number;
  onOpen: (studentUid: string) => void;
}) {
  const state = studentEvidenceStateLabel(student);
  const breadth = studentBreadthLine(student);
  const when = formatRelativeTime(student.latestSelectionAt, now);
  return (
    <Pressable
      onPress={() => onOpen(student.studentUid)}
      style={styles.studentRow}
      accessibilityRole="button"
      accessibilityLabel={joinSpokenLabel([student.displayName, state, breadth, when, "Öğrenciyi incele"])}
    >
      <View
        style={[styles.marker, student.hasRecoverySignal ? styles.markerRecovering : null]}
        importantForAccessibility="no-hide-descendants"
      >
        <Text style={[styles.markerText, student.hasRecoverySignal ? styles.markerTextRecovering : null]}>
          {student.displayName.trim().charAt(0).toUpperCase() || "?"}
        </Text>
      </View>
      <View style={styles.studentBody}>
        {/* Wraps rather than truncating: at 150% text scale a two-line name is
            still a name, while "Berk …" is not. */}
        <Text style={styles.studentName}>{student.displayName}</Text>
        <Text style={styles.studentMeta} numberOfLines={2}>
          {`${state} · ${breadth} · ${when}`}
        </Text>
      </View>
      <View style={styles.studentAction}>
        <Text style={styles.studentActionLabel}>İncele</Text>
        <Ionicons name="chevron-forward" size={iconSize.xs} color={colors.primary} />
      </View>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  section: {
    gap: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  title: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  windowNote: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  stateBox: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  stateText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  retry: {
    minHeight: minTouchTarget,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  retryLabel: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
  thread: {
    position: "relative",
    gap: spacing.xs,
    paddingTop: spacing.xxs,
  },
  rail: {
    position: "absolute",
    left: MARKER_SIZE / 2 - RAIL_WIDTH / 2,
    top: MARKER_SIZE / 2,
    bottom: MARKER_SIZE / 2,
    width: RAIL_WIDTH,
    backgroundColor: colors.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
  },
  node: {
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowBody: {
    flex: 1,
    gap: 2,
    paddingTop: 2,
  },
  rowText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  rowTextEmphasis: {
    ...typography.bodyStrong,
  },
  rowTrailing: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  students: {
    marginLeft: MARKER_SIZE + spacing.xs,
    gap: spacing.xxs,
  },
  studentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: minTouchTarget,
    paddingVertical: spacing.xxs,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  marker: {
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  // Recovering: the ring opens up. Shape, not hue — legible in greyscale.
  markerRecovering: {
    backgroundColor: colors.background,
    borderStyle: "dashed",
    borderColor: colors.textTertiary,
  },
  markerText: {
    ...typography.label,
    color: colors.primary,
  },
  markerTextRecovering: {
    color: colors.textSecondary,
  },
  studentBody: {
    flex: 1,
    gap: 1,
  },
  studentName: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  studentMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  studentAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  studentActionLabel: {
    ...typography.label,
    color: colors.primary,
  },
  showAll: {
    minHeight: minTouchTarget,
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
  },
  showAllLabel: {
    ...typography.label,
    color: colors.primary,
  },
  classLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    minHeight: minTouchTarget,
    marginLeft: MARKER_SIZE + spacing.xs,
  },
  classLinkLabel: {
    ...typography.label,
    color: colors.primary,
  },
}));
