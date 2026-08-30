import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Text, View } from "react-native";

import { Card } from "@components/ui/Card";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

import { LearningStoryMoment, LearningStoryMomentKind } from "../services/learningStoryTypes";

interface LearningStoryMomentCardProps {
  moment: LearningStoryMoment;
  onPressAction: (moment: LearningStoryMoment) => void;
}

// Phase 56 — one topic's story beat.
//
// The signature element is the evidence bar below: it renders the KNOWN
// outcome composition, and it is deliberately not a sequence. No per-outcome
// ordering is stored anywhere in the product, so a row of dots reading
// "zorlandım → zorlandım → çözdüm" would be a fabricated timeline. A single
// proportional bar cannot be misread that way, and the one genuinely ordered
// fact the data does have — which outcome was most recent — is stated
// separately and in words.

const TONE: Record<
  LearningStoryMomentKind,
  { icon: keyof typeof Ionicons.glyphMap; color: () => string }
> = {
  // Semantic, not brand: these distinguish meaning, so they must not all
  // collapse into the brand blue.
  recovery: { icon: "trending-up", color: () => colors.success },
  strength: { icon: "shield-checkmark-outline", color: () => colors.success },
  needs_attention: { icon: "refresh-circle-outline", color: () => colors.danger },
  one_off: { icon: "information-circle-outline", color: () => colors.textSecondary },
};

function EvidenceBar({ moment }: { moment: LearningStoryMoment }) {
  const { solved, struggled, again, total } = moment.evidence;
  // Guaranteed non-zero by the builder, but division is worth guarding.
  if (total <= 0) return null;
  const segments = [
    { key: "solved", count: solved, color: colors.success },
    { key: "struggled", count: struggled, color: colors.danger },
    { key: "again", count: again, color: colors.textTertiary },
  ].filter((segment) => segment.count > 0);

  return (
    <View
      style={styles.evidenceBar}
      accessibilityRole="image"
      // Spoken as composition, matching what the bar actually encodes.
      accessibilityLabel={`Kayıtlı ${total} denemenin ${solved} tanesi çözüldü, ${struggled} tanesinde zorlanıldı.`}
    >
      {segments.map((segment) => (
        <View
          key={segment.key}
          style={[
            styles.evidenceSegment,
            { flex: segment.count, backgroundColor: segment.color },
          ]}
        />
      ))}
    </View>
  );
}

export const LearningStoryMomentCard = memo(function LearningStoryMomentCard({
  moment,
  onPressAction,
}: LearningStoryMomentCardProps) {
  // Phase 49 — memo() blocks prop-driven re-renders but not context updates.
  useThemeSubscription();
  const tone = TONE[moment.kind];

  return (
    <Card>
      <View style={styles.headerRow}>
        <View style={[styles.iconWrap, { backgroundColor: colors.surfaceMuted }]}>
          <Ionicons name={tone.icon} size={18} color={tone.color()} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.topic} numberOfLines={1}>
            {moment.topic}
          </Text>
          <Text style={styles.subject} numberOfLines={1}>
            {moment.subject}
          </Text>
        </View>
      </View>

      <Text style={styles.title}>{moment.title}</Text>
      <Text style={styles.description}>{moment.description}</Text>

      <EvidenceBar moment={moment} />

      {/* The single ordered fact the counters can actually support, said in
          words rather than drawn as a timeline. */}
      <Text style={styles.lastOutcome}>
        {moment.lastOutcome === "solved"
          ? "Son denemende çözdün."
          : moment.lastOutcome === "struggled"
            ? "Son denemende zorlandın."
            : "Son denemende tekrar etmek istedin."}
      </Text>

      {moment.action ? (
        <View style={styles.actionRow}>
          <PrimaryButton
            label={moment.action.label}
            onPress={() => onPressAction(moment)}
          />
        </View>
      ) : null}
    </Card>
  );
});

const styles = themedStyles(() => ({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flexShrink: 1,
  },
  topic: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  subject: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  title: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  evidenceBar: {
    flexDirection: "row",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    marginTop: spacing.sm,
    gap: 2,
  },
  evidenceSegment: {
    height: "100%",
    borderRadius: 3,
  },
  lastOutcome: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  actionRow: {
    marginTop: spacing.sm,
  },
}));
