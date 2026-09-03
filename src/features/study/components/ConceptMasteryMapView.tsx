import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Text, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";
import { joinSpokenLabel } from "@utils/spokenLabel";

import {
  ConceptMasteryMap,
  ConceptNode,
  ConceptPresentation,
  conceptReviewNote,
  conceptStateLabel,
  conceptSupportingFact,
  SubjectRegion,
} from "../services/conceptMasteryMap";

// Phase 70 — the learning landscape as the student reads it.
//
// A FLOW, NOT A CARD WALL
//
// Concepts inside a subject sit on a single connected rail rather than in
// repeated bordered boxes. That is the point of the screen: a subject is a
// region the student moves through, and a stack of identical cards would say
// nothing about how the parts relate. The rail is purely decorative — it is
// hidden from screen readers, and every row is complete without it.
//
// COLOUR IS NEVER THE MESSAGE
//
// Each state carries an icon AND a text label; the accent only reinforces what
// the words already say. That is also why the attention state is a small dot
// and a short phrase rather than a red banner: a student who keeps struggling
// with something needs to see it, not be alarmed by it.

interface ConceptMasteryMapViewProps {
  map: ConceptMasteryMap;
}

const STATE_ICON: Readonly<Record<ConceptPresentation, keyof typeof Ionicons.glyphMap>> = {
  // Descriptive, never punitive: this says "this came back", not "you failed".
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
      // Neutral, deliberately not faded out of relevance: "we do not know yet"
      // is a real state, not a disabled one.
      return colors.textTertiary;
  }
}

function tintFor(presentation: ConceptPresentation): string {
  switch (presentation) {
    case "needs_attention":
      return colors.dangerMuted;
    case "recovering":
      return colors.primaryMuted;
    case "steady":
      return colors.successMuted;
    default:
      return colors.surfaceMuted;
  }
}

const ConceptRow = memo(function ConceptRow({
  concept,
  isFirst,
  isLast,
}: {
  concept: ConceptNode;
  isFirst: boolean;
  isLast: boolean;
}) {
  useThemeSubscription();

  const accent = accentFor(concept.presentation);
  const label = conceptStateLabel(concept);
  const fact = conceptSupportingFact(concept);
  const note = conceptReviewNote(concept);

  return (
    <View style={styles.conceptRow}>
      {/* Decorative rail. Hidden from assistive tech on both platforms so the
          reading order stays topic → state → fact → review note. */}
      <View
        style={styles.rail}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {isFirst ? null : <View style={styles.connectorTop} />}
        <View style={[styles.node, { borderColor: accent, backgroundColor: tintFor(concept.presentation) }]}>
          <View style={[styles.nodeCore, { backgroundColor: accent }]} />
        </View>
        {isLast ? null : <View style={styles.connectorBottom} />}
      </View>

      <View
        // The trailing gap belongs BETWEEN nodes, not after the last one:
        // leaving it on the final row stacks with the region gap and makes the
        // rhythm between subjects visibly uneven.
        style={[styles.conceptContent, isLast ? styles.conceptContentLast : null]}
        accessible
        // Spoken in the order the row is read: topic, state, fact, then the
        // review note. Joined without doubling the sentence-final stops the
        // copy already carries.
        accessibilityLabel={joinSpokenLabel([concept.topic, label, fact, note])}
      >
        <Text style={styles.topic}>{concept.topic}</Text>

        <View style={styles.stateRow}>
          <Ionicons name={STATE_ICON[concept.presentation]} size={iconSize.xs} color={accent} />
          <Text style={[styles.stateLabel, { color: accent }]}>{label}</Text>
        </View>

        <Text style={styles.fact}>{fact}</Text>

        {note ? (
          <View style={styles.reviewRow}>
            <Ionicons name="time-outline" size={iconSize.xs} color={colors.primary} />
            <Text style={styles.reviewText}>{note}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
});

const SubjectRegionView = memo(function SubjectRegionView({ region }: { region: SubjectRegion }) {
  useThemeSubscription();
  return (
    <View style={styles.region}>
      <View style={styles.regionHeader}>
        {/* A short brand bar rather than another icon — it marks the start of a
            region and echoes the mark's diagonal without drawing the logo. */}
        <View style={styles.regionMark} />
        <Text style={styles.regionTitle}>{region.subject}</Text>
        <Text style={styles.regionCount}>
          {region.concepts.length === 1 ? "1 konu" : `${region.concepts.length} konu`}
        </Text>
      </View>

      <View style={styles.conceptList}>
        {region.concepts.map((concept, index) => (
          <ConceptRow
            key={concept.id}
            concept={concept}
            isFirst={index === 0}
            isLast={index === region.concepts.length - 1}
          />
        ))}
      </View>
    </View>
  );
});

export const ConceptMasteryMapView = memo(function ConceptMasteryMapView({
  map,
}: ConceptMasteryMapViewProps) {
  useThemeSubscription();
  return (
    <View style={styles.wrapper}>
      {map.subjects.map((region) => (
        <SubjectRegionView key={region.subject} region={region} />
      ))}
    </View>
  );
});

const NODE_SIZE = 14;
const RAIL_WIDTH = 22;
const NODE_TOP = 4;

const styles = themedStyles(() => ({
  wrapper: {
    width: "100%",
    gap: spacing.xl,
  },
  region: {
    gap: spacing.sm,
  },
  regionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  regionMark: {
    width: 4,
    height: 18,
    borderRadius: radius.sm,
    backgroundColor: colors.brandCyan,
  },
  regionTitle: {
    ...typography.title,
    color: colors.textPrimary,
    flex: 1,
  },
  regionCount: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  conceptList: {
    width: "100%",
  },
  conceptRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  rail: {
    width: RAIL_WIDTH,
    alignSelf: "stretch",
    alignItems: "center",
  },
  connectorTop: {
    position: "absolute",
    top: 0,
    height: NODE_TOP,
    width: 2,
    backgroundColor: colors.divider,
  },
  connectorBottom: {
    position: "absolute",
    top: NODE_TOP + NODE_SIZE,
    bottom: 0,
    width: 2,
    backgroundColor: colors.divider,
  },
  node: {
    marginTop: NODE_TOP,
    width: NODE_SIZE,
    height: NODE_SIZE,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  nodeCore: {
    width: 4,
    height: 4,
    borderRadius: radius.pill,
  },
  conceptContent: {
    flex: 1,
    gap: 2,
    paddingBottom: spacing.lg,
  },
  conceptContentLast: {
    paddingBottom: 0,
  },
  topic: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  stateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    flexWrap: "wrap",
  },
  stateLabel: {
    ...typography.caption,
  },
  fact: {
    ...typography.body,
    color: colors.textSecondary,
  },
  reviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    marginTop: spacing.xxs,
    flexWrap: "wrap",
  },
  reviewText: {
    ...typography.caption,
    color: colors.primary,
  },
}));
