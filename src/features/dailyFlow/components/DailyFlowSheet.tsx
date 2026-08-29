import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { BottomActionSheet } from "@components/ui/BottomActionSheet";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";

import { DailyFlowItem, DailyFlowKind } from "../services/dailyFlowTypes";

interface DailyFlowSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  items: readonly DailyFlowItem[];
  emptyText: string;
  onPressItem: (item: DailyFlowItem) => void;
}

const ICON: Record<DailyFlowKind, keyof typeof Ionicons.glyphMap> = {
  assignment: "document-text-outline",
  due_review: "refresh-outline",
  reinforce_topic: "barbell-outline",
  practice: "book-outline",
  student_signal: "person-outline",
  topic_hotspot: "people-outline",
};

// Phase 54 — Daily Flow, on demand.
//
// WHY A SHEET INSTEAD OF A SECTION
//
// Phase 53 put Daily Flow in the Student Feed's header as a section above
// the list. That was correct for Phase 50's scrolling launch feed, but it is
// incompatible with Phase 54's immersive pager: any block above the list
// makes the first question stop filling the viewport, which is exactly the
// "conventional stacked feed" this phase exists to undo.
//
// The intelligence is unchanged — same composer, same items, same routing.
// Only the presentation moved: a compact pill in the header opens this
// sheet, and dismissing it returns to the exact same feed page, because the
// pager's own scroll position was never unmounted.
//
// The teacher feed keeps the inline section (DailyFlowSection): its surface
// is still a scan-friendly list, where a section above the content is the
// right shape.
function DailyFlowSheetComponent({
  visible,
  onClose,
  title,
  items,
  emptyText,
  onPressItem,
}: DailyFlowSheetProps) {
  useThemeSubscription();

  return (
    <BottomActionSheet visible={visible} onClose={onClose} title={title}>
      {items.length === 0 ? (
        <Text style={styles.emptyText}>{emptyText}</Text>
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => onPressItem(item)}
              style={styles.row}
              accessibilityRole="button"
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
    </BottomActionSheet>
  );
}

export const DailyFlowSheet = memo(DailyFlowSheetComponent);

const styles = themedStyles(() => ({
  list: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 56,
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
    ...typography.body,
    color: colors.textSecondary,
    paddingVertical: spacing.sm,
  },
}));
