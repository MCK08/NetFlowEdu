import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Text, View } from "react-native";

import { PrimaryButton } from "@components/ui/PrimaryButton";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

import { archiveEntryDescription } from "../services/analyticsPresentation";
import type { ArchiveSummary } from "../services/studentAnalytics";

interface ArchiveFocusCardProps {
  summary: ArchiveSummary;
  onOpen: () => void;
}

// Phase 107 — the one loud card on Kişisel Analiz.
//
// The archive is this area's reason to exist, so it gets the treatment
// NextActionSection has on the Study Hub: the theme's blue-tinted panel
// (soft blue in Light, elevated navy in Dark), the mark in a disc, a real
// title and the page's only filled button. Its counts are the whole archive,
// independent of the period selector above — the archive is a long memory,
// not a window — which is why it sits in its own card rather than among the
// period's tiles.
export const ArchiveFocusCard = memo(function ArchiveFocusCard({ summary, onOpen }: ArchiveFocusCardProps) {
  useThemeSubscription();
  const description = archiveEntryDescription(summary);
  return (
    <View style={styles.card}>
      <View style={styles.row} accessible accessibilityLabel={`Öğrenme arşivin. Çözemediğim Sorular. ${description}.`}>
        <View style={styles.iconDisc}>
          <Ionicons name="archive-outline" size={iconSize.md} color={colors.primary} accessibilityElementsHidden />
        </View>
        <View style={styles.text}>
          <Text style={styles.label}>Öğrenme arşivin</Text>
          <Text style={styles.title}>Çözemediğim Sorular</Text>
          <Text style={styles.detail}>{description}</Text>
        </View>
      </View>
      <PrimaryButton
        label={summary.total > 0 ? "Arşivi Aç" : "Arşive Göz At"}
        onPress={onOpen}
        accessibilityHint="Daha önce zorlandığın soruların listesini açar"
      />
    </View>
  );
});

const styles = themedStyles(() => ({
  card: {
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.xxl,
    padding: spacing.md,
    gap: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  iconDisc: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  label: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.primary,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  detail: {
    ...typography.body,
    color: colors.textSecondary,
  },
}));
