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

interface LearningAtlasEntryCardProps {
  onPress: () => void;
  /** Real counts, shown only when non-zero — never a placeholder "0 konu". */
  conceptCount: number;
  attentionCount: number;
  dueCount: number;
}

// Phase 76 — the Hub's exploration entry.
//
// WHY THIS REPLACED THE CONCEPT MAP ROW RATHER THAN JOINING IT
//
// The Atlas composes the concept map: the same Phase 70 nodes, the same
// verdicts, the same wording, placed in a landscape alongside the current
// focus, the lenses and the ordered motion. Two rows a thumb apart, both
// promising "your concepts", would have made the student choose between a
// screen and a strictly larger version of itself. The map keeps its route and
// is one tap away from inside the Atlas (see LearningAtlasScreen's
// "Konu Haritasını Gör").
//
// Deliberately a shade more present than the Learning Story row beside it —
// the mark, a two-line lead, a hairline rule — because it is the entry to the
// product's one landscape surface. Not a hero banner: the Hub's job is still
// to get the student moving, and the next-action card above must stay the
// loudest thing on the page.
export const LearningAtlasEntryCard = memo(function LearningAtlasEntryCard({
  onPress,
  conceptCount,
  attentionCount,
  dueCount,
}: LearningAtlasEntryCardProps) {
  useThemeSubscription();

  // Only true parts, joined. A student with no evidence yet gets an invitation
  // rather than a row of zeroes.
  const parts: string[] = [];
  if (conceptCount > 0) parts.push(`${conceptCount} konu`);
  if (attentionCount > 0) parts.push(`${attentionCount} konuda tekrar eden zorlanma`);
  if (dueCount > 0) parts.push(`${dueCount} konuda tekrar zamanı`);
  const description =
    parts.length > 0
      ? parts.join(" · ")
      : "Çalıştıkça konuların, zorlanmaların ve tekrar zamanların burada birleşecek";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Öğrenme Atlasım. ${description}`}
      accessibilityHint="Öğrenme kanıtlarının tek görünümünü açar"
      style={styles.pressable}
    >
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.iconWrap}>
            <Ionicons name="git-network-outline" size={iconSize.md} color={colors.primary} />
          </View>
          <View style={styles.text}>
            <Text style={styles.title}>Öğrenme Atlasım</Text>
            <Text style={styles.description}>{description}</Text>
          </View>
          <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.primary} />
        </View>
      </View>
    </Pressable>
  );
});

const styles = themedStyles(() => ({
  pressable: {
    minHeight: minTouchTarget,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryMuted,
  },
  text: {
    flex: 1,
    minWidth: 0,
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
