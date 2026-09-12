import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { EmptyState } from "@components/ui/EmptyState";
import { SectionHeader } from "@components/ui/SectionHeader";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";
import { joinSpokenLabel } from "@utils/spokenLabel";

import {
  canDraftSmallGroup,
  ClassSemanticCohort,
  ClassSemanticCohortMember,
  ClassSemanticCohortSummary,
  cohortAbsenceCopy,
  cohortActionReadyFact,
  cohortEvidenceLine,
  cohortFact,
  cohortMemberInitials,
  cohortRecoveryFact,
} from "../services/classSemanticCohorts";

// Phase 81 — "Ortak Öğrenme Örüntüleri".
//
// THE VISUAL, AND WHY IT IS THIS ONE
//
// Several students, one shared instructional focus. The card draws exactly
// that and nothing more: a column of student markers, a rail that gathers
// them, and a single node carrying the label an author wrote. Convergence is
// the whole claim, so convergence is the whole picture.
//
// Not a graph, not a canvas, not a second Atlas. There are no edges between
// students, because no evidence says students are related to each other —
// only that each of them independently met the same meaning. Drawing a network
// would assert something the records do not contain.
//
// Not a card wall either. Four cohorts at most, each one a shape a teacher can
// read in a glance rather than a rectangle they have to parse.
//
// NOT AN ALARM
//
// No red wall, no warning triangle, no count of "risky students". The palette
// is the product's own blue flow language, and the strongest sentence on the
// card names a topic. Action-readiness appears as a second, quieter line
// precisely because it is separate evidence — Phase 43's, not this feature's.

interface ClassSemanticCohortSectionProps {
  summary: ClassSemanticCohortSummary;
  isLoading: boolean;
  hasError: boolean;
  onOpenStudent: (studentUid: string) => void;
  onDraftSmallGroup: (cohort: ClassSemanticCohort) => void;
  /** Phase 82 — opens the class's shared vocabulary. Placed on this section's
   *  header because this is where a teacher first meets the labels as something
   *  with consequences, and therefore where they are most likely to want to
   *  tidy one up. */
  onManageVocabulary: () => void;
}

// How many markers the rail shows before it collapses the rest into a count.
// Five keeps the card's height honest on a 375px screen; the full list is one
// tap away and the overflow marker says exactly how many it stands for.
const MAX_VISIBLE_MARKERS = 5;

const MARKER_SIZE = 34;
// The rail must start and end at the FIRST and LAST marker's centre, not at
// the column's edges — the same alignment lesson the Learning Atlas's spine
// learned. Deriving both ends from one constant is what keeps them true when
// the marker size changes.
const MARKER_HALF = MARKER_SIZE / 2;
const STUB_WIDTH = 14;
const LEAD_WIDTH = 18;

/** One student's marker.
 *
 *  Active and recovering are told apart by BORDER STYLE and by the accessible
 *  label, never by colour alone: a dashed ring reads as "opened up" next to a
 *  solid one in greyscale, at 150% zoom, and to a screen reader. */
const Marker = memo(function Marker({
  member,
  isLast,
}: {
  member: ClassSemanticCohortMember;
  isLast: boolean;
}) {
  useThemeSubscription();
  return (
    <View style={[styles.markerRow, isLast ? null : styles.markerRowSpaced]}>
      <View style={[styles.marker, member.hasRecoverySignal ? styles.markerRecovering : null]}>
        <Text
          style={[styles.markerText, member.hasRecoverySignal ? styles.markerTextRecovering : null]}
          numberOfLines={1}
        >
          {cohortMemberInitials(member.displayName)}
        </Text>
      </View>
      <View style={styles.stub} />
    </View>
  );
});

/** The overflow marker. Says how many people it stands for rather than
 *  trailing off into an ellipsis. */
const OverflowMarker = memo(function OverflowMarker({ count }: { count: number }) {
  useThemeSubscription();
  return (
    <View style={styles.markerRow}>
      <View style={[styles.marker, styles.markerOverflow]}>
        <Text style={styles.markerOverflowText} numberOfLines={1}>{`+${count}`}</Text>
      </View>
      <View style={styles.stub} />
    </View>
  );
});

const MemberRow = memo(function MemberRow({
  member,
  onOpenStudent,
}: {
  member: ClassSemanticCohortMember;
  onOpenStudent: (studentUid: string) => void;
}) {
  useThemeSubscription();
  const open = useCallback(() => onOpenStudent(member.studentUid), [member.studentUid, onOpenStudent]);

  // Two independent facts about this person, each stated as what it is. The
  // repetition fact came from their own selections; the struggle fact came
  // from Phase 42 and would be just as true if this feature did not exist.
  const repetition = `${member.distinctQuestionCount} farklı soru · ${member.occurrenceCount} kayıt`;
  const status = member.hasRecoverySignal ? "Toparlanma sinyali" : "Tekrar eden seçim";
  const action = member.isActionReady ? "Bu konuda tekrar eden zorlanma kanıtı da var" : null;

  return (
    <Pressable
      onPress={open}
      style={styles.memberRow}
      accessibilityRole="button"
      accessibilityLabel={joinSpokenLabel([member.displayName, status, repetition, action])}
      accessibilityHint="Öğrencinin performans ekranını açar"
    >
      <View
        style={[styles.memberMarker, member.hasRecoverySignal ? styles.markerRecovering : null]}
      >
        <Text
          style={[styles.markerText, member.hasRecoverySignal ? styles.markerTextRecovering : null]}
          numberOfLines={1}
        >
          {cohortMemberInitials(member.displayName)}
        </Text>
      </View>
      <View style={styles.memberBody}>
        <Text style={styles.memberName} numberOfLines={1}>
          {member.displayName}
        </Text>
        <Text style={styles.memberFacts} numberOfLines={2}>
          {`${status} · ${repetition}`}
        </Text>
        {action ? (
          <View style={styles.memberActionRow}>
            <Ionicons name="repeat-outline" size={iconSize.xs} color={colors.textSecondary} />
            <Text style={styles.memberAction} numberOfLines={2}>
              {action}
            </Text>
          </View>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textTertiary} />
    </Pressable>
  );
});

const CohortCard = memo(function CohortCard({
  cohort,
  onOpenStudent,
  onDraftSmallGroup,
}: {
  cohort: ClassSemanticCohort;
  onOpenStudent: (studentUid: string) => void;
  onDraftSmallGroup: (cohort: ClassSemanticCohort) => void;
}) {
  useThemeSubscription();
  const [isOpen, setIsOpen] = useState(false);
  const toggle = useCallback(() => setIsOpen((current) => !current), []);
  const draft = useCallback(() => onDraftSmallGroup(cohort), [cohort, onDraftSmallGroup]);

  const visibleMembers = cohort.members.slice(0, MAX_VISIBLE_MARKERS);
  const overflow = cohort.members.length - visibleMembers.length;

  const recovery = cohortRecoveryFact(cohort);
  const actionReady = cohortActionReadyFact(cohort);
  const canDraft = canDraftSmallGroup(cohort);

  // The spoken order Phase 81 specifies: focus, scope, breadth, evidence,
  // recovery, action-readiness. `expanded` is carried in the words as well as
  // in the state, because react-native-web drops accessibilityState.expanded
  // on a Pressable (verified in the DOM during Phase 76).
  const spoken = joinSpokenLabel([
    `Ortak odak: ${cohort.label}`,
    `${cohort.subject}, ${cohort.topic}`,
    cohortEvidenceLine(cohort),
    cohortFact(cohort),
    recovery,
    actionReady,
    isOpen ? "Genişletildi" : "Katılan öğrenciler için genişlet",
  ]);

  return (
    <View style={styles.card}>
      <Pressable
        onPress={toggle}
        style={styles.cardHeader}
        accessibilityRole="button"
        accessibilityLabel={spoken}
        aria-expanded={isOpen}
      >
        {/* THE CONVERGENCE. Markers on the left, one rail gathering them,
            one focus on the right. */}
        <View style={styles.convergence}>
          <View style={styles.markerColumn}>
            {visibleMembers.map((member, index) => (
              <Marker
                key={member.studentUid}
                member={member}
                isLast={index === visibleMembers.length - 1 && overflow <= 0}
              />
            ))}
            {overflow > 0 ? <OverflowMarker count={overflow} /> : null}
            {/* Absolutely positioned so it spans first-centre to last-centre
                regardless of how many markers there are. */}
            <View style={styles.rail} />
          </View>

          <View style={styles.lead} />

          <View style={styles.focus}>
            <View style={styles.focusDot} />
            <View style={styles.focusBody}>
              <Text style={styles.focusLabel} numberOfLines={3}>
                {cohort.label}
              </Text>
              <Text style={styles.focusScope} numberOfLines={2}>
                {`${cohort.subject} · ${cohort.topic}`}
              </Text>
            </View>
          </View>

          <Ionicons
            name={isOpen ? "chevron-up" : "chevron-down"}
            size={iconSize.sm}
            color={colors.textTertiary}
          />
        </View>

        <View style={styles.factBlock}>
          <Text style={styles.evidenceLine}>{cohortEvidenceLine(cohort)}</Text>
          <Text style={styles.fact}>{cohortFact(cohort)}</Text>
          {recovery ? (
            <View style={styles.factRow}>
              <Ionicons name="trending-up-outline" size={iconSize.xs} color={colors.textSecondary} />
              <Text style={styles.secondaryFact}>{recovery}</Text>
            </View>
          ) : null}
          {actionReady ? (
            <View style={styles.factRow}>
              <Ionicons name="repeat-outline" size={iconSize.xs} color={colors.textSecondary} />
              <Text style={styles.secondaryFact}>{actionReady}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>

      {isOpen ? (
        <View style={styles.memberList}>
          {cohort.members.map((member) => (
            <MemberRow key={member.studentUid} member={member} onOpenStudent={onOpenStudent} />
          ))}
        </View>
      ) : null}

      {/* Offered only when Phase 43 independently marks two or more of these
          students targetable in this exact topic. Never when the cohort alone
          is large — a cohort is not a reason to assign anything. */}
      {canDraft ? (
        <Pressable
          onPress={draft}
          style={styles.draftButton}
          accessibilityRole="button"
          accessibilityLabel={joinSpokenLabel([
            "Küçük grup ödevi taslağı hazırla",
            `${cohort.actionReadyStudentIds.length} öğrenci`,
            `${cohort.subject}, ${cohort.topic}`,
          ])}
          accessibilityHint="Ödev oluşturma ekranını bu öğrenciler ve bu konu seçili olarak açar"
        >
          <Ionicons name="people-outline" size={iconSize.sm} color={colors.primary} />
          <Text style={styles.draftLabel}>
            {`Küçük grup taslağı hazırla (${cohort.actionReadyStudentIds.length})`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
});

export const ClassSemanticCohortSection = memo(function ClassSemanticCohortSection({
  summary,
  isLoading,
  hasError,
  onOpenStudent,
  onDraftSmallGroup,
  onManageVocabulary,
}: ClassSemanticCohortSectionProps) {
  useThemeSubscription();

  // Loading renders nothing rather than a skeleton: this section sits below
  // two that are already populated, and a placeholder appearing and vanishing
  // under them would move the content a teacher is reading.
  if (isLoading) return null;

  if (hasError) {
    return (
      <View style={styles.section}>
        <SectionHeader
          title="Ortak Öğrenme Örüntüleri"
          action={{ label: "Etiketleri yönet", onPress: onManageVocabulary }}
        />
        <View style={styles.stateBox}>
          <EmptyState
            icon="cloud-offline-outline"
            title="Ortak örüntüler şu an yüklenemedi"
            description="Sayfayı yenilediğinizde yeniden denenecek."
          />
        </View>
      </View>
    );
  }

  if (summary.isEmpty) {
    const copy = cohortAbsenceCopy(summary);
    return (
      <View style={styles.section}>
        <SectionHeader
          title="Ortak Öğrenme Örüntüleri"
          action={{ label: "Etiketleri yönet", onPress: onManageVocabulary }}
        />
        <View style={styles.stateBox}>
          <EmptyState icon="git-merge-outline" title={copy.title} description={copy.description} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <SectionHeader
        title="Ortak Öğrenme Örüntüleri"
        action={{ label: "Etiketleri yönet", onPress: onManageVocabulary }}
      />
      {summary.cohorts.map((cohort) => (
        <CohortCard
          key={cohort.id}
          cohort={cohort}
          onOpenStudent={onOpenStudent}
          onDraftSmallGroup={onDraftSmallGroup}
        />
      ))}
    </View>
  );
});

const styles = themedStyles(() => ({
  section: {
    gap: spacing.xs,
  },
  stateBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
    overflow: "hidden" as const,
  },
  cardHeader: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  convergence: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 0,
  },
  markerColumn: {
    position: "relative" as const,
  },
  markerRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    height: MARKER_SIZE,
  },
  markerRowSpaced: {
    marginBottom: spacing.xxs,
  },
  marker: {
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    borderRadius: radius.pill,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  // Recovering: the ring opens up. Shape, not hue — legible in greyscale.
  markerRecovering: {
    backgroundColor: colors.background,
    borderStyle: "dashed" as const,
    borderColor: colors.textTertiary,
  },
  markerOverflow: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
  },
  markerText: {
    ...typography.label,
    color: colors.primary,
  },
  markerTextRecovering: {
    color: colors.textSecondary,
  },
  markerOverflowText: {
    ...typography.label,
    color: colors.textSecondary,
  },
  stub: {
    width: STUB_WIDTH,
    height: 1,
    backgroundColor: colors.border,
  },
  rail: {
    position: "absolute" as const,
    left: MARKER_SIZE + STUB_WIDTH,
    top: MARKER_HALF,
    bottom: MARKER_HALF,
    width: 1,
    backgroundColor: colors.border,
  },
  lead: {
    width: LEAD_WIDTH,
    height: 1,
    backgroundColor: colors.border,
  },
  focus: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: spacing.xs,
  },
  focusDot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  focusBody: {
    flex: 1,
    gap: 2,
  },
  focusLabel: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  focusScope: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  factBlock: {
    gap: spacing.xxs,
  },
  evidenceLine: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  fact: {
    ...typography.body,
    color: colors.textSecondary,
  },
  factRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: spacing.xxs,
  },
  secondaryFact: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  memberList: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  memberRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    minHeight: minTouchTarget,
  },
  memberMarker: {
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    borderRadius: radius.pill,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  memberBody: {
    flex: 1,
    gap: 2,
  },
  memberName: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  memberFacts: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  memberActionRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: spacing.xxs,
  },
  memberAction: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  draftButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: spacing.xs,
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.primaryMuted,
  },
  draftLabel: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
}));
