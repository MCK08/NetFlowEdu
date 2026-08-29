import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";

import { DailyFlowItem, DailyFlowKind } from "../services/dailyFlowTypes";

interface DailyFlowSectionProps {
  title: string;
  items: readonly DailyFlowItem[];
  // Shown in place of the rows when there is nothing to do. Always honest —
  // the caller picks the first-run vs nothing-pending sentence (§25/§26).
  emptyText: string;
  onPressItem: (item: DailyFlowItem) => void;
}

// One icon per kind — a second, non-colour channel for what a row is about,
// so state is never communicated by colour alone (§43).
const ICON: Record<DailyFlowKind, keyof typeof Ionicons.glyphMap> = {
  assignment: "document-text-outline",
  due_review: "refresh-outline",
  reinforce_topic: "barbell-outline",
  practice: "book-outline",
  student_signal: "person-outline",
  topic_hotspot: "people-outline",
};

// Phase 53 — the compact orientation layer above the feed.
//
// DESIGN INTENT (§28/§29)
//
// One grouped surface with a small section title and at most three rows —
// not three large stacked cards, which would consume the whole first
// viewport and turn the content-first feed into a dashboard. The feed's
// first content card must still be reachable by a short scroll on a
// standard iPhone.
//
// It renders whatever it is given and reports taps. It computes no
// priority, reads no store, and holds no state.
function DailyFlowSectionComponent({
  title,
  items,
  emptyText,
  onPressItem,
}: DailyFlowSectionProps) {
  // Phase 49/52 — memo() blocks prop-driven re-renders but NOT context
  // updates; without this the component would keep its previous theme's
  // styles after a live theme switch.
  useThemeSubscription();

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>

      {items.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.emptyText}>{emptyText}</Text>
        </View>
      ) : (
        <View style={styles.card}>
          {items.map((item, index) => (
            <Pressable
              key={item.id}
              onPress={() => onPressItem(item)}
              style={[styles.row, index > 0 ? styles.rowDivided : null]}
              accessibilityRole="button"
              // One announcement carrying the whole row: what it is, why,
              // and what tapping does — rather than three separate nodes
              // the screen reader would read as unrelated fragments (§42).
              accessibilityLabel={
                item.reason
                  ? `${item.title}. ${item.reason} ${item.actionLabel}`
                  : `${item.title}. ${item.actionLabel}`
              }
            >
              <View
                style={[styles.iconWrap, item.isAttention ? styles.iconWrapAttention : null]}
              >
                <Ionicons
                  name={ICON[item.kind]}
                  size={18}
                  color={item.isAttention ? colors.danger : colors.primary}
                />
              </View>

              <View style={styles.rowText}>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                {item.reason ? (
                  <Text style={styles.rowReason} numberOfLines={2}>
                    {item.reason}
                  </Text>
                ) : null}
                <Text style={styles.rowAction} numberOfLines={1}>
                  {item.actionLabel}
                </Text>
              </View>

              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

export const DailyFlowSection = memo(DailyFlowSectionComponent);

const styles = themedStyles(() => ({
  section: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    gap: spacing.xs,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textTertiary,
    textTransform: "uppercase",
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    // Comfortably above the 44pt guidance even when the row has no reason
    // line and text is at its default size (§41).
    minHeight: 56,
  },
  rowDivided: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryMuted,
  },
  iconWrapAttention: {
    backgroundColor: colors.dangerMuted,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  rowReason: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  rowAction: {
    ...typography.label,
    color: colors.primary,
    marginTop: 2,
  },
  emptyText: {
    ...typography.caption,
    color: colors.textSecondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
}));
