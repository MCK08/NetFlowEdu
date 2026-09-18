import { Href } from "expo-router";
import { Text, View } from "react-native";

import { AppBackButton } from "@components/ui/AppBackButton";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

interface AnalyticsHeaderProps {
  title: string;
  /** Small line above the title — the subject on a topic screen. */
  eyebrow?: string | null;
  subtitle?: string | null;
  /** Present on every pushed analytics screen; absent on the tab root. A
   *  plain string: see routes.ts for why these paths are cast at one point. */
  backFallbackHref?: string;
}

// Phase 107 — one header shape for the analytics screens, the one Öğrenme
// Haritam already uses: the shared back affordance beside a display title,
// then a single body line. Every pushed screen passes a canonical parent so a
// deep link or cold start is never stranded (Phase 102's rule).
export function AnalyticsHeader({ title, eyebrow, subtitle, backFallbackHref }: AnalyticsHeaderProps) {
  useThemeSubscription();
  return (
    <View style={styles.header}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <View style={styles.titleRow}>
        {backFallbackHref ? (
          <AppBackButton fallbackHref={backFallbackHref as Href} style={styles.back} />
        ) : null}
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  header: {
    gap: spacing.xxs,
  },
  eyebrow: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.primary,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  back: {
    marginLeft: -spacing.sm,
  },
  title: {
    ...typography.screenTitle,
    color: colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
}));
