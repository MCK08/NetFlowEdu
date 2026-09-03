import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { Card } from "@components/ui/Card";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize } from "@theme/sizes";
import { minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

interface ConceptMapEntryCardProps {
  onPress: () => void;
  /** Real counts, shown only when non-zero — never a placeholder "0 konu". */
  conceptCount: number;
  attentionCount: number;
}

// Phase 70 — the way into Öğrenme Haritam from the Study Hub.
//
// One restrained row, matching the Learning Story entry beside it rather than
// inventing a second visual language: the Hub's job is to get the student
// moving, and a preview of the map here would duplicate the screen and push
// the next-action card down the page.
//
// The counts are a reason to tap, not a summary. They appear only when they
// are real, so the row never shows a hollow "0 konu" to a student who has not
// studied yet.
export const ConceptMapEntryCard = memo(function ConceptMapEntryCard({
  onPress,
  conceptCount,
  attentionCount,
}: ConceptMapEntryCardProps) {
  // Phase 49 — memo() blocks prop-driven re-renders but not context updates.
  useThemeSubscription();

  const description =
    conceptCount === 0
      ? "Konularındaki öğrenme kanıtını gör"
      : attentionCount > 0
        ? `${conceptCount} konu · ${attentionCount} konuda tekrar eden zorlanma`
        : `${conceptCount} konuda öğrenme kanıtı`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Öğrenme Haritam. ${description}`}
      style={styles.pressable}
    >
      <Card>
        <View style={styles.row}>
          <View style={styles.iconWrap}>
            <Ionicons name="map-outline" size={iconSize.sm} color={colors.primary} />
          </View>
          <View style={styles.text}>
            <Text style={styles.title}>Öğrenme Haritam</Text>
            <Text style={styles.description}>{description}</Text>
          </View>
          <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textTertiary} />
        </View>
      </Card>
    </Pressable>
  );
});

const styles = themedStyles(() => ({
  pressable: {
    minHeight: minTouchTarget,
  },
  row: {
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
    backgroundColor: colors.primaryMuted,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  description: {
    ...typography.caption,
    color: colors.textSecondary,
  },
}));
