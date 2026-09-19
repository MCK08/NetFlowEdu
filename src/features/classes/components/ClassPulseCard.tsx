import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Text, View } from "react-native";

import { Card } from "@components/ui/Card";
import { colors } from "@theme/colors";
import { iconSize } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

import { CLASS_PULSE_EMPTY, ClassPulse, classPulseFacts } from "../services/classSocial";

// Phase 110 — "Bu Haftanın Sınıf İlerlemesi". This is where a mockup would
// put a leaderboard, and it deliberately does not: it says what the CLASS did
// together this week, in collective sentences, and names no one. Below the
// participant threshold it says nothing at all rather than a number that
// would really be one person's.
export const ClassPulseCard = memo(function ClassPulseCard({ pulse }: { pulse: ClassPulse | null }) {
  useThemeSubscription();
  const facts = classPulseFacts(pulse);
  return (
    <View style={styles.section}>
      <Text style={styles.title} accessibilityRole="header">
        Bu Haftanın Sınıf İlerlemesi
      </Text>
      <Card variant="outlined" style={styles.card}>
        {facts ? (
          facts.map((fact) => (
            <View key={fact} style={styles.fact} accessible accessibilityLabel={fact}>
              <Ionicons name="people-outline" size={iconSize.sm} color={colors.primary} accessibilityElementsHidden />
              <Text style={styles.factText}>{fact}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.empty}>{CLASS_PULSE_EMPTY}</Text>
        )}
      </Card>
    </View>
  );
});

const styles = themedStyles(() => ({
  section: {
    gap: spacing.xs,
  },
  title: {
    ...typography.subtitle,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  card: {
    gap: spacing.xs,
  },
  fact: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  factText: {
    ...typography.body,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  empty: {
    ...typography.body,
    color: colors.textSecondary,
  },
}));
