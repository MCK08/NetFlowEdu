import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";
import { trailStepLabel } from "@features/learningStory/services/learningTrail";

import { ConceptPresentation } from "../services/conceptMasteryMap";
import {
  AtlasFocus,
  AtlasNode,
  AtlasRegion,
  ATLAS_MOTION_CAPTION,
} from "../services/learningAtlas";
import { patternTitle } from "../services/strugglePatternMemory";

// Phase 76 — the Atlas as the student reads it.
//
// WHY THIS IS NOT A LIST OF CARDS
//
// Every concept hangs off a single continuous spine, and the content blocks
// alternate between two indents joined by a short diagonal. That stagger is
// the whole composition: it is the NetFlowEdu mark's own geometry — two
// verticals with a diagonal crossing between them — used as layout rather than
// stamped on as decoration. A stack of equal boxes would say nothing about how
// the parts sit together, which is the one thing this screen exists to show.
//
// WHAT THE CONNECTORS MEAN
//
// Grouping and reading order. Nothing else. This repository contains no
// authored prerequisite metadata, so a line between two concepts must never
// suggest that one leads to the other. The spine is decorative, hidden from
// assistive technology, and every row is complete without it.
//
// COLOUR IS NEVER THE MESSAGE
//
// Each state carries an icon AND Phase 70's own text label. Brand blue is
// reserved for orientation — the focus, the selection, the flow — and is never
// the thing that tells a student how they are doing.

const STATE_ICON: Readonly<Record<ConceptPresentation, keyof typeof Ionicons.glyphMap>> = {
  needs_attention: "repeat-outline",
  recovering: "trending-up-outline",
  watch: "flag-outline",
  steady: "checkmark-circle-outline",
  needs_evidence: "ellipse-outline",
};

function accentFor(presentation: ConceptPresentation): string {
  switch (presentation) {
    case "needs_attention":
      return colors.danger;
    case "recovering":
      return colors.primary;
    case "steady":
      return colors.success;
    case "watch":
      return colors.textSecondary;
    case "needs_evidence":
    default:
      return colors.textTertiary;
  }
}

interface LearningAtlasViewProps {
  focus: AtlasFocus | null;
  regions: readonly AtlasRegion[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpenPatterns: () => void;
  onOpenConceptMap: () => void;
  onStartReview: () => void;
  onStartStudy: () => void;
  /** True once the viewport is wide enough to place content on both sides of
   *  the spine. Passed in rather than measured here so the layout decision is
   *  made once, by the screen that already knows its width. */
  isWide: boolean;
}

export const LearningAtlasView = memo(function LearningAtlasView({
  focus,
  regions,
  selectedId,
  onSelect,
  onOpenPatterns,
  onOpenConceptMap,
  onStartReview,
  onStartStudy,
  isWide,
}: LearningAtlasViewProps) {
  useThemeSubscription();

  // A single running index across every region, so the stagger continues
  // through a subject boundary instead of resetting and breaking the flow.
  let flowIndex = 0;

  return (
    <View style={styles.atlas}>
      {focus ? <FocusNode focus={focus} isWide={isWide} /> : null}

      {regions.map((region) => (
        <View key={region.subject} style={styles.region}>
          {/* The label sits BESIDE the spine, not above it, so the flow runs
              unbroken from one subject into the next. A region is a stretch of
              the same journey, not a new list. */}
          <View style={[styles.regionHeader, isWide ? styles.regionHeaderWide : null]}>
            <View style={styles.regionSpine} accessibilityElementsHidden importantForAccessibility="no">
              <View style={styles.spineSegment} />
            </View>
            <Text style={styles.regionTitle}>{region.subject}</Text>
          </View>

          {region.nodes.map((node, index) => {
            const side = flowIndex % 2 === 0 ? "start" : "end";
            flowIndex += 1;
            return (
              <AtlasNodeRow
                key={node.id}
                node={node}
                side={side}
                isWide={isWide}
                isLast={index === region.nodes.length - 1}
                isSelected={node.id === selectedId}
                onSelect={onSelect}
                onOpenPatterns={onOpenPatterns}
                onOpenConceptMap={onOpenConceptMap}
                onStartReview={onStartReview}
                onStartStudy={onStartStudy}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
});

// The one node the product is actively pointing at. Sits at the head of the
// spine because that is what it is: where the flow starts today.
function FocusNode({ focus, isWide }: { focus: AtlasFocus; isWide: boolean }) {
  return (
    <View
      style={[styles.focusRow, isWide ? styles.focusRowWide : null]}
      accessible
      accessibilityLabel={`Şimdi. ${focus.label}. ${focus.title}. ${focus.detail}`}
    >
      <View style={styles.focusMarker} accessibilityElementsHidden importantForAccessibility="no">
        <View style={styles.focusMarkerCore} />
      </View>
      <View style={styles.focusBody}>
        <Text style={styles.focusEyebrow}>ŞİMDİ · {focus.label}</Text>
        <Text style={styles.focusTitle}>{focus.title}</Text>
        {focus.detail ? <Text style={styles.focusDetail}>{focus.detail}</Text> : null}
      </View>
    </View>
  );
}

interface AtlasNodeRowProps {
  node: AtlasNode;
  side: "start" | "end";
  isWide: boolean;
  isLast: boolean;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onOpenPatterns: () => void;
  onOpenConceptMap: () => void;
  onStartReview: () => void;
  onStartStudy: () => void;
}

function AtlasNodeRow({
  node,
  side,
  isWide,
  isLast,
  isSelected,
  onSelect,
  onOpenPatterns,
  onStartReview,
  onStartStudy,
}: AtlasNodeRowProps) {
  const accent = accentFor(node.concept.presentation);
  // Everything a screen reader needs, in one sentence, in the order a sighted
  // reader takes it in. The stagger and the spine contribute nothing here —
  // they are layout, not information.
  const label = [
    node.topic,
    node.stateLabel,
    node.fact,
    node.reviewNote,
    node.isFocus ? "Şu anda öne çıkan konu." : null,
    // Phase 76 — the open/closed state is in the LABEL, not only in
    // accessibilityState. React Native Web drops accessibilityState.expanded
    // (verified in the DOM: only role and aria-label survive), so a reader
    // would otherwise learn nothing about whether the detail is showing. The
    // aria-expanded prop below covers web properly; this covers everything.
    isSelected ? "Ayrıntı açık." : null,
  ]
    .filter(Boolean)
    .join(" ");

  const spine = (
    // Decorative. Hidden on both platforms — every row is complete without it,
    // and announcing a line would add nothing a reader could use.
    <View
      key="spine"
      style={styles.spine}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.spineSegmentHead} />
      <View style={[styles.marker, { borderColor: accent }, node.isFocus ? styles.markerFocus : null]}>
        {node.isFocus ? <View style={styles.markerFocusCore} /> : null}
      </View>
      <View style={[styles.spineSegment, isLast ? styles.spineSegmentFaded : null]} />
    </View>
  );

  // The link from the spine to the content. On a narrow screen its REACH
  // alternates, which is what turns one column into two implied verticals
  // joined by angled links — the mark's own geometry used as layout. On a wide
  // screen the alternation moves to the SIDE of a centred spine instead, so
  // the reach becomes uniform and the crossing is carried by the layout.
  const elbow = (
    <View
      key="elbow"
      style={[styles.elbow, isWide ? styles.elbowWide : side === "end" ? styles.elbowLong : styles.elbowShort]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );

  // The toggle and the detail are SIBLINGS, never nested.
  //
  // Putting the detail inside the node's own Pressable was the obvious shape,
  // and it is wrong on web: react-native-web renders every Pressable as a
  // <button>, so the detail's own actions became buttons inside a button —
  // invalid HTML that React reports as a hydration error and that leaves
  // assistive technology with no sane reading of either control.
  const content = (
    <View
      key="content"
      style={[
        styles.node,
        isSelected ? styles.nodeSelected : null,
        node.isFocus && !isSelected ? styles.nodeFocus : null,
      ]}
    >
      <Pressable
        onPress={() => onSelect(node.id)}
        style={styles.nodeToggle}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: isSelected, selected: isSelected }}
        aria-expanded={isSelected}
        accessibilityHint={isSelected ? "Ayrıntıyı kapatır" : "Bu konunun ayrıntısını açar"}
      >
        <View style={styles.nodeHeader}>
          <Text style={styles.nodeTopic} numberOfLines={2}>
            {node.topic}
          </Text>
          {node.isDue ? (
            <View style={styles.dueTag}>
              <Text style={styles.dueTagText}>Tekrar</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.stateRow}>
          <Ionicons
            name={STATE_ICON[node.concept.presentation]}
            size={iconSize.xs}
            color={accent}
            accessibilityElementsHidden
          />
          <Text style={[styles.stateLabel, { color: accent }]}>{node.stateLabel}</Text>
        </View>

        <Text style={styles.nodeFact}>{node.fact}</Text>
      </Pressable>

      {isSelected ? (
        <NodeDetail
          node={node}
          onOpenPatterns={onOpenPatterns}
          onStartReview={onStartReview}
          onStartStudy={onStartStudy}
        />
      ) : null}
    </View>
  );

  if (!isWide) {
    return (
      <View style={styles.nodeRow}>
        {spine}
        {elbow}
        {content}
      </View>
    );
  }

  // Wide: one CENTRED spine with the content alternating across it. The empty
  // half is a real spacer rather than a margin, so both sides stay the same
  // width and the spine cannot drift as topic names change length. This is the
  // part that makes the desktop Atlas a composition instead of a phone column
  // stretched across a monitor.
  const empty = <View key="empty" style={styles.half} />;
  return (
    <View style={styles.nodeRowWide}>
      {side === "start" ? (
        <>
          <View style={styles.halfEnd}>{content}</View>
          {elbow}
          {spine}
          {empty}
        </>
      ) : (
        <>
          {empty}
          {spine}
          {elbow}
          <View style={styles.half}>{content}</View>
        </>
      )}
    </View>
  );
}

// Progressive disclosure. Deliberately NOT a second Concept Map or a second
// Pattern Memory — it shows what this screen alone can add (the real ordered
// motion), states the canonical review line, and routes to the deeper screens
// rather than reproducing them.
function NodeDetail({
  node,
  onOpenPatterns,
  onStartReview,
  onStartStudy,
}: {
  node: AtlasNode;
  onOpenPatterns: () => void;
  onStartReview: () => void;
  onStartStudy: () => void;
}) {
  return (
    <View style={styles.detail}>
      <View style={styles.detailDivider} accessibilityElementsHidden importantForAccessibility="no" />

      {node.motion.length > 0 ? (
        <View
          style={styles.motion}
          accessible
          accessibilityLabel={`${ATLAS_MOTION_CAPTION}: ${node.motion
            .map((event) => trailStepLabel(event.outcome))
            .join(", ")}`}
        >
          <Text style={styles.detailCaption}>{ATLAS_MOTION_CAPTION}</Text>
          <View style={styles.motionRow}>
            {node.motion.map((event, index) => (
              <View key={event.id} style={styles.motionStep}>
                {index > 0 ? (
                  <Ionicons
                    name="chevron-forward"
                    size={12}
                    color={colors.textTertiary}
                    accessibilityElementsHidden
                  />
                ) : null}
                <Text
                  style={[
                    styles.motionLabel,
                    event.outcome === "struggled" ? styles.motionStruggle : null,
                    event.outcome === "solved" ? styles.motionSolved : null,
                  ]}
                >
                  {trailStepLabel(event.outcome)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : (
        // Absence stated plainly. The concept's cumulative evidence above is
        // still valid — only the ordered window is empty, and saying so is not
        // the same as saying nothing happened.
        <Text style={styles.detailCaption}>
          Son öğrenme kayıtlarında bu konuya ait bir hareket yok.
        </Text>
      )}

      {node.reviewNote ? <Text style={styles.detailNote}>{node.reviewNote}</Text> : null}

      {node.patternKind ? (
        <Text style={styles.detailNote}>
          {patternTitle({
            id: node.id,
            kind: node.patternKind,
            subject: node.subject,
            topic: node.topic,
            distinctQuestionCount: 0,
            focusQuestionId: null,
            focusStruggleCount: 0,
            recentOutcomes: [],
          })}
        </Text>
      ) : null}

      <View style={styles.detailActions}>
        {node.isDue ? (
          <DetailAction label="Tekrarlarını Aç" onPress={onStartReview} />
        ) : (
          <DetailAction label="Çalışmaya Devam Et" onPress={onStartStudy} />
        )}
        {node.patternKind ? (
          <DetailAction label="Zorlanma Örüntülerim" onPress={onOpenPatterns} variant="quiet" />
        ) : null}
      </View>
    </View>
  );
}

function DetailAction({
  label,
  onPress,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "quiet";
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.action, variant === "quiet" ? styles.actionQuiet : null]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[styles.actionText, variant === "quiet" ? styles.actionTextQuiet : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

const SPINE_WIDTH = 28;
const MARKER = 12;
// Where the marker's top edge sits inside a row. Shared by the spine and the
// elbow so the two always meet, whatever the topic name does below them.
const MARKER_TOP = 22;

const styles = themedStyles(() => ({
  atlas: {
    gap: spacing.lg,
  },

  focusRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
  },
  focusRowWide: {
    alignSelf: "center",
    maxWidth: 460,
    // Nudged by half a spine so the marker lands on the same axis every node
    // below it hangs from, instead of near it.
    paddingRight: SPINE_WIDTH,
  },
  focusMarker: {
    width: SPINE_WIDTH,
    alignItems: "center",
    paddingTop: spacing.xs,
  },
  focusMarkerCore: {
    width: 16,
    height: 16,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    borderWidth: 4,
    borderColor: colors.primaryMuted,
  },
  focusBody: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: 2,
  },
  focusEyebrow: {
    ...typography.label,
    color: colors.primary,
    letterSpacing: 0.6,
  },
  focusTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  focusDetail: {
    ...typography.caption,
    color: colors.textSecondary,
  },

  region: {
    gap: 0,
  },
  regionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  // Wide: the label rides the centred spine instead of floating at the far
  // left, so a region reads as a stretch of the same journey rather than a
  // heading detached from it.
  regionHeaderWide: {
    alignSelf: "center",
    flexDirection: "column",
    gap: spacing.xxs,
  },
  regionSpine: {
    width: SPINE_WIDTH,
    alignItems: "center",
    height: 34,
  },
  regionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },

  nodeRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  nodeRowWide: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  half: {
    flex: 1,
    minWidth: 0,
  },
  halfEnd: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-end",
  },
  spine: {
    width: SPINE_WIDTH,
    alignItems: "center",
  },
  // Fixed, not flexed: the marker has to land at a KNOWN height so the elbow
  // can meet it. Centring it in a row whose height depends on how long the
  // topic name wraps would leave the two drifting apart.
  spineSegmentHead: {
    height: MARKER_TOP,
    width: 2,
    backgroundColor: colors.divider,
  },
  spineSegment: {
    flex: 1,
    width: 2,
    minHeight: spacing.sm,
    backgroundColor: colors.divider,
  },
  spineSegmentFaded: {
    backgroundColor: "transparent",
  },
  marker: {
    width: MARKER,
    height: MARKER,
    borderRadius: radius.pill,
    borderWidth: 2,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  markerFocus: {
    borderColor: colors.primary,
    width: MARKER + 4,
    height: MARKER + 4,
  },
  markerFocusCore: {
    width: 4,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  // The link from the spine to the content. Its REACH alternates, which is
  // what turns a single column into two implied verticals joined by angled
  // links — the mark's geometry as layout, drawn with a rule rather than a
  // dependency so it scales with the OS font setting like everything else.
  elbow: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: MARKER_TOP + MARKER / 2,
  },
  elbowShort: {
    width: spacing.xs,
  },
  elbowLong: {
    width: spacing.xxl,
  },
  elbowWide: {
    width: spacing.md,
  },

  // Deliberately NOT a card. An unselected concept is content hanging off the
  // flow — no fill, no border, no shadow — because a stack of identical filled
  // boxes is the one thing this screen must not become. A surface appears only
  // when a concept is opened or is the current focus, which is exactly when
  // the extra weight means something.
  nodeToggle: {
    minHeight: minTouchTarget,
    justifyContent: "center",
    gap: 2,
  },
  node: {
    flex: 1,
    minWidth: 0,
    width: "100%",
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: "transparent",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.md,
    gap: 2,
  },
  nodeSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  nodeFocus: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  nodeHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  nodeTopic: {
    ...typography.subtitle,
    color: colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
  dueTag: {
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  dueTagText: {
    ...typography.label,
    color: colors.primary,
  },
  stateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  stateLabel: {
    ...typography.caption,
    flex: 1,
    minWidth: 0,
  },
  nodeFact: {
    ...typography.caption,
    color: colors.textTertiary,
  },

  detail: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  detailDivider: {
    height: 1,
    backgroundColor: colors.divider,
  },
  motion: {
    gap: spacing.xxs,
  },
  detailCaption: {
    ...typography.label,
    color: colors.textTertiary,
    letterSpacing: 0.4,
  },
  motionRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.xxs,
  },
  motionStep: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  motionLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  motionStruggle: {
    color: colors.danger,
  },
  motionSolved: {
    color: colors.success,
  },
  detailNote: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  detailActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    paddingTop: spacing.xxs,
  },
  action: {
    minHeight: minTouchTarget,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  actionQuiet: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionText: {
    ...typography.caption,
    color: colors.textInverse,
    fontWeight: "600",
  },
  actionTextQuiet: {
    color: colors.primary,
  },
}));
