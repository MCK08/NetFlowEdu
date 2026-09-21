import { Ionicons } from "@expo/vector-icons";
import { Fragment, memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card } from "@components/ui/Card";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

export interface ProfileMenuItem {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  /** One short line saying what the destination actually does. */
  description: string;
  onPress: () => void;
  /** Sign out and the like: same geometry, danger-toned label. */
  tone?: "default" | "danger";
  /** Phase 115 — false for a row that ACTS instead of navigating. A chevron
   *  promises another screen; signing out is not one. */
  chevron?: boolean;
  disabled?: boolean;
}

interface ProfileMenuGroupProps {
  items: readonly ProfileMenuItem[];
  /** Phase 115 — the section label above the card ("Hesap", "Uygulama").
   *  Settings groups several cards under names; Profil's two groups do not
   *  need them, so this stays optional rather than forcing empty headings. */
  title?: string;
}

// Phase 114 — several destinations as ONE object.
//
// Profil used to stack a separate Card per subject, so five unrelated
// panels arrived at the same visual weight and the screen read as a
// dashboard. A group is one card with hairline-separated rows: the card
// says "these belong together", the rows say "these are siblings", and the
// page gets its hierarchy back without a single new colour.
//
// AnalyticsNavRow is deliberately not reused — it is one card PER row, which
// is the opposite grouping, and widening it with a "sometimes grouped" mode
// would blur what it means on the screens already using it.
export const ProfileMenuGroup = memo(function ProfileMenuGroup({ items, title }: ProfileMenuGroupProps) {
  useThemeSubscription();
  if (items.length === 0) return null;

  return (
    <View style={styles.section}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      <Card style={styles.card}>
      {items.map((item, index) => (
        <Fragment key={item.key}>
          {index > 0 ? <View style={styles.separator} /> : null}
          <Pressable
            onPress={item.onPress}
            disabled={item.disabled}
            accessibilityRole="button"
            accessibilityState={{ disabled: item.disabled ?? false }}
            // Title and description in one label: VoiceOver reads the row as
            // the single thing it is, and the icon stays decorative.
            accessibilityLabel={`${item.title}. ${item.description}`}
            style={styles.row}
          >
            <View style={[styles.iconWrap, item.tone === "danger" ? styles.iconWrapDanger : null]}>
              <Ionicons
                name={item.icon}
                size={iconSize.sm}
                color={item.tone === "danger" ? colors.danger : colors.primary}
                accessibilityElementsHidden
              />
            </View>
            <View style={styles.text}>
              <Text style={[styles.title, item.tone === "danger" ? styles.titleDanger : null]}>
                {item.title}
              </Text>
              {/* No numberOfLines: a long Turkish subtitle wraps under a
                  large text size rather than being clipped, and the row
                  grows with it. */}
              <Text style={styles.description}>{item.description}</Text>
            </View>
            {item.chevron === false ? null : (
              <Ionicons
                name="chevron-forward"
                size={iconSize.sm}
                color={colors.textTertiary}
                accessibilityElementsHidden
              />
            )}
          </Pressable>
        </Fragment>
      ))}
      </Card>
    </View>
  );
});

const styles = themedStyles(() => ({
  section: {
    gap: spacing.xs,
  },
  sectionTitle: {
    ...typography.caption,
    color: colors.textTertiary,
    paddingHorizontal: spacing.xs,
  },
  card: {
    // The rows carry their own padding so a separator can run the full width
    // of the card rather than floating inside it.
    paddingVertical: spacing.xxs,
    paddingHorizontal: 0,
    gap: 0,
  },
  row: {
    flexDirection: "row",
    // Top-aligned: with a wrapped two-line subtitle, centring would push the
    // icon to the middle of the block instead of beside its title.
    alignItems: "flex-start",
    gap: spacing.sm,
    minHeight: minTouchTarget,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryMuted,
  },
  iconWrapDanger: {
    backgroundColor: colors.dangerMuted,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    // Keeps the title optically level with the icon square beside it.
    paddingTop: 2,
  },
  title: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  titleDanger: {
    color: colors.danger,
  },
  description: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    // Indented to the text column, so the group reads as a list rather than
    // a stack of boxes.
    marginLeft: spacing.md + 36 + spacing.sm,
  },
}));
