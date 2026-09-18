import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Text, View } from "react-native";

import { Card } from "@components/ui/Card";
import { StatusLabel } from "@components/ui/StatusLabel";
import { colors } from "@theme/colors";
import { iconSize } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

import {
  cohortSentence,
  COMMUNITY_BAND_ICON,
  COMMUNITY_BAND_LABEL,
  COMMUNITY_BAND_SENTENCE,
  COMMUNITY_BAND_TONE,
  CommunitySignal,
} from "../services/communityBand";

interface CommunitySignalPanelProps {
  signal: CommunitySignal | null;
}

// Phase 108 — "Topluluk Sinyali" on a question: one quiet outlined card that
// says whether this question was hard for others too. It exists to take the
// edge off self-blame, so it is never loud, never red, and never a number a
// student could feel measured by. Below the privacy floor it says only that
// there is not enough data; while loading it renders nothing.
export const CommunitySignalPanel = memo(function CommunitySignalPanel({
  signal,
}: CommunitySignalPanelProps) {
  useThemeSubscription();
  if (!signal) return null;
  const cohort = cohortSentence(signal);
  const sentence = COMMUNITY_BAND_SENTENCE[signal.band];

  return (
    <View
      accessible
      accessibilityLabel={`Topluluk sinyali. ${sentence}${cohort ? ` ${cohort}.` : ""}`}
    >
      <Card variant="outlined" style={styles.card}>
        <View style={styles.titleRow}>
          <Ionicons
            name="people-outline"
            size={iconSize.sm}
            color={colors.textTertiary}
            accessibilityElementsHidden
          />
          <Text style={styles.title}>Topluluk Sinyali</Text>
        </View>
        <StatusLabel
          icon={COMMUNITY_BAND_ICON[signal.band]}
          tone={COMMUNITY_BAND_TONE[signal.band]}
          textStyle={styles.band}
        >
          {COMMUNITY_BAND_LABEL[signal.band]}
        </StatusLabel>
        <Text style={styles.sentence}>{sentence}</Text>
        {cohort ? <Text style={styles.cohort}>{cohort}</Text> : null}
      </Card>
    </View>
  );
});

const styles = themedStyles(() => ({
  card: {
    gap: spacing.xxs,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  title: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.textTertiary,
    textTransform: "uppercase",
  },
  band: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  sentence: {
    ...typography.body,
    color: colors.textSecondary,
  },
  cohort: {
    ...typography.caption,
    color: colors.textTertiary,
  },
}));
