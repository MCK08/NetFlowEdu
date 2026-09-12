import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";
import { joinSpokenLabel } from "@utils/spokenLabel";

import { REVISION_TRUST_NOTE } from "@features/questions/services/questionRevision";

import {
  authorabilityLabel,
  authorabilityNote,
  mappedChoiceFeedback,
  mappedChoiceLine,
  mappedChoiceText,
  MAX_INITIAL_EVIDENCE_QUESTIONS,
  questionAbsenceCopy,
  questionEvidenceLine,
  questionTimelineLine,
  SemanticQuestionEvidence,
  SemanticQuestionEvidenceList,
  QUESTION_SECTION_NOTE,
  QUESTION_SECTION_TITLE,
} from "../services/semanticQuestionEvidence";

// Phase 85 — the author's own questions, from the meaning's side.
//
// WHAT THIS SHOWS
//
// For one shared definition: which of the class's questions carry it, on which
// wrong option, with what feedback the author wrote for that option, and what
// the loaded records show around that exact question.
//
// WHAT IT DELIBERATELY DOES NOT SHOW
//
// A quality score, a difficulty figure, a "this distractor is too strong"
// verdict, or an instruction to fix anything. A wrong option being chosen is
// what a wrong option is for. The numbers are counts of records; the judgement
// is the author's.
//
// WHERE THE EDIT BUTTON IS, AND IS NOT (Phase 86)
//
// A row the viewer authored offers "Soruyu düzenle", which opens the owner-only
// revision screen. A row someone else authored offers nothing — not a disabled
// button, not a hidden one — because firestore.rules make `questions` update
// `isOwner(resource.data.ownerId)` and nothing else, and this surface reports
// that boundary rather than widening it. `authorability` is computed from the
// question's ownerId against the signed-in uid (Phase 85), and the screen, the
// service and the rules each refuse a non-owner again.

interface SemanticQuestionStudioSectionProps {
  list: SemanticQuestionEvidenceList;
  /** Collapsed by default — the definition detail above it is already dense. */
  defaultOpen?: boolean;
  /** Phase 86 — opens the revision screen. Offered only on rows the viewer
   *  authored; absent, the section is read-only for every row. */
  onEditQuestion?: (questionId: string) => void;
}

const QuestionRow = memo(function QuestionRow({
  row,
  onEdit,
}: {
  row: SemanticQuestionEvidence;
  onEdit?: (questionId: string) => void;
}) {
  useThemeSubscription();
  const [isOpen, setIsOpen] = useState(false);
  const toggle = useCallback(() => setIsOpen((current) => !current), []);

  const prompt = row.question.description?.trim() || "Görsel soru";
  const mapped = mappedChoiceLine(row);
  const evidence = questionEvidenceLine(row);
  const timeline = questionTimelineLine(row);
  const ownership = authorabilityLabel(row);
  const note = authorabilityNote(row);

  return (
    <View style={styles.card}>
      <Pressable
        onPress={toggle}
        style={styles.cardHeader}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        // react-native-web drops accessibilityState.expanded on a Pressable,
        // so the state is carried in the words too (verified in the DOM).
        aria-expanded={isOpen}
        // Reading order: the question, the mapped option, what the records
        // show, the timeline relationship, then who authored it.
        accessibilityLabel={joinSpokenLabel([
          prompt,
          mapped,
          evidence,
          timeline,
          ownership,
          isOpen ? "Genişletildi" : "Ayrıntılar için genişlet",
        ])}
      >
        <View style={styles.cardBody}>
          <Text style={styles.prompt} numberOfLines={2}>
            {prompt}
          </Text>
          <View style={styles.metaRow}>
            <Ionicons name="git-branch-outline" size={iconSize.xs} color={colors.textTertiary} />
            <Text style={styles.meta} numberOfLines={1}>
              {mapped}
            </Text>
          </View>
          <Text style={styles.evidence} numberOfLines={3}>
            {evidence}
          </Text>
        </View>
        <Ionicons
          name={isOpen ? "chevron-up" : "chevron-down"}
          size={iconSize.sm}
          color={colors.textTertiary}
        />
      </Pressable>

      {isOpen ? (
        <View style={styles.detail}>
          {/* The mapped option as currently authored, with the author's own
              words beneath it. Accent and shape, never a red alarm. */}
          {row.mappedChoiceLabels.map((label) => {
            const text = mappedChoiceText(row, label);
            const feedback = mappedChoiceFeedback(row, label);
            return (
              <View key={label} style={styles.choiceBlock}>
                <View style={styles.choiceRow}>
                  <View style={styles.choiceBadge}>
                    <Text style={styles.choiceBadgeText}>{label}</Text>
                  </View>
                  <Text style={styles.choiceText} numberOfLines={3}>
                    {text ?? "Şık metni yok"}
                  </Text>
                </View>
                {feedback ? (
                  <View style={styles.feedbackRow}>
                    <Ionicons
                      name="chatbubble-ellipses-outline"
                      size={iconSize.xs}
                      color={colors.textSecondary}
                    />
                    <Text style={styles.feedbackText} numberOfLines={4}>
                      {feedback}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}

          {timeline ? (
            <View style={styles.factRow}>
              <Ionicons name="time-outline" size={iconSize.xs} color={colors.textSecondary} />
              <Text style={styles.fact}>{timeline}</Text>
            </View>
          ) : null}

          <View style={styles.factRow}>
            <Ionicons
              name={row.authorability === "own" ? "person-outline" : "people-outline"}
              size={iconSize.xs}
              color={colors.textSecondary}
            />
            <Text style={styles.fact}>{note ?? ownership}</Text>
          </View>

          {/* Phase 86 — offered only to the author. The other-author row keeps
              its explanation above and gets no control at all. */}
          {row.authorability === "own" && onEdit ? (
            <Pressable
              onPress={() => onEdit(row.questionId)}
              style={styles.editAction}
              accessibilityRole="button"
              accessibilityLabel="Soruyu düzenle"
              accessibilityHint="Sorunun güncel halini değiştirir; önceki öğrenme kayıtları değişmez"
            >
              <Ionicons name="create-outline" size={iconSize.sm} color={colors.primary} />
              <Text style={styles.editActionLabel}>Soruyu düzenle</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

export const SemanticQuestionStudioSection = memo(function SemanticQuestionStudioSection({
  list,
  defaultOpen = false,
  onEditQuestion,
}: SemanticQuestionStudioSectionProps) {
  useThemeSubscription();
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [showAll, setShowAll] = useState(false);

  // A different definition is a different page — fold it again.
  useEffect(() => {
    setIsOpen(defaultOpen);
    setShowAll(false);
  }, [defaultOpen, list]);

  const toggleOpen = useCallback(() => setIsOpen((current) => !current), []);
  const toggleAll = useCallback(() => setShowAll((current) => !current), []);

  if (list.isEmpty) {
    const copy = questionAbsenceCopy();
    return (
      <View style={styles.section}>
        <Text style={styles.title} accessibilityRole="header">
          {QUESTION_SECTION_TITLE}
        </Text>
        <Text style={styles.emptyTitle}>{copy.title}</Text>
        <Text style={styles.note}>{copy.description}</Text>
      </View>
    );
  }

  const visible = showAll ? list.questions : list.questions.slice(0, MAX_INITIAL_EVIDENCE_QUESTIONS);
  const hidden = list.questions.length - visible.length;

  return (
    <View style={styles.section}>
      <Pressable
        onPress={toggleOpen}
        style={styles.header}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        aria-expanded={isOpen}
        accessibilityLabel={joinSpokenLabel([
          QUESTION_SECTION_TITLE,
          `${list.questions.length} soru`,
          isOpen ? "Genişletildi" : "Genişletmek için seçin",
        ])}
      >
        <Ionicons name="documents-outline" size={iconSize.sm} color={colors.primary} />
        <Text style={styles.headerLabel}>{QUESTION_SECTION_TITLE}</Text>
        <Text style={styles.headerCount}>{`${list.questions.length}`}</Text>
        <Ionicons
          name={isOpen ? "chevron-up" : "chevron-down"}
          size={iconSize.sm}
          color={colors.textTertiary}
        />
      </Pressable>

      {isOpen ? (
        <View style={styles.body}>
          {/* Said before any count, so none of them reads as a verdict. */}
          <Text style={styles.note}>{QUESTION_SECTION_NOTE}</Text>

          {visible.map((row) => (
            <QuestionRow key={row.questionId} row={row} onEdit={onEditQuestion} />
          ))}

          {hidden > 0 || showAll ? (
            <Pressable
              onPress={toggleAll}
              style={styles.showAll}
              accessibilityRole="button"
              accessibilityState={{ expanded: showAll }}
              accessibilityLabel={
                showAll ? "Daha az soru göster" : `${hidden} soru daha, tümünü göster`
              }
            >
              <Text style={styles.showAllLabel}>
                {showAll ? "Daha az göster" : `Tümünü göster (${hidden} daha)`}
              </Text>
            </Pressable>
          ) : null}

          {/* Phase 86 — the one promise revision makes, stated once for the
              whole list rather than repeated on every row. */}
          <Text style={styles.note}>{REVISION_TRUST_NOTE}</Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = themedStyles(() => ({
  section: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    gap: spacing.xxs,
  },
  title: {
    ...typography.label,
    color: colors.textTertiary,
  },
  emptyTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  note: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  header: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: spacing.xs,
    minHeight: minTouchTarget,
  },
  headerLabel: {
    ...typography.bodyStrong,
    color: colors.primary,
    flex: 1,
  },
  headerCount: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  body: {
    gap: spacing.xs,
  },
  card: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden" as const,
  },
  cardHeader: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: spacing.xs,
    padding: spacing.sm,
    minHeight: minTouchTarget,
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  prompt: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  metaRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: spacing.xxs,
  },
  meta: {
    ...typography.caption,
    color: colors.textTertiary,
    flexShrink: 1,
  },
  evidence: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  detail: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: spacing.xs,
  },
  choiceBlock: {
    gap: spacing.xxs,
  },
  choiceRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: spacing.xs,
  },
  // The mapped option is marked by a filled label badge and the accent border
  // below — shape and position, never a warning colour.
  choiceBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: radius.sm,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: spacing.xxs,
  },
  choiceBadgeText: {
    ...typography.label,
    color: colors.primary,
  },
  choiceText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  feedbackRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: spacing.xxs,
    paddingLeft: spacing.lg,
  },
  feedbackText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
    fontStyle: "italic" as const,
  },
  factRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: spacing.xxs,
  },
  fact: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  editAction: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: spacing.xxs,
    minHeight: minTouchTarget,
    alignSelf: "flex-start" as const,
  },
  editActionLabel: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
  showAll: {
    minHeight: minTouchTarget,
    justifyContent: "center" as const,
  },
  showAllLabel: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "600" as const,
  },
}));
