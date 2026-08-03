import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

import { formatRequestBadge } from "../services/requestBadge";

export interface SocialSegment<T extends string> {
  key: T;
  label: string;
  // Rendered as a badge next to the label. Undefined means "not known yet"
  // and renders nothing at all — never a "0" for a list that has not
  // finished loading.
  count?: number;
}

interface SocialSegmentControlProps<T extends string> {
  segments: SocialSegment<T>[];
  value: T;
  onChange: (key: T) => void;
}

// A real segmented control on one inset track, replacing three separate
// pill buttons whose labels grew an inline "(3)" suffix. The count now
// lives in its own badge, so a long label and a large count can no longer
// squeeze each other out on a small screen.
function SocialSegmentControlComponent<T extends string>({
  segments,
  value,
  onChange,
}: SocialSegmentControlProps<T>) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {segments.map((segment) => {
        const selected = segment.key === value;
        // Reuses the existing, tested badge rule: nothing at 0, the exact
        // number up to 99, then "99+" — so a large request count can never
        // widen the segment past its share of the track.
        const badgeText =
          typeof segment.count === "number" ? formatRequestBadge(segment.count) : null;
        return (
          <AnimatedPressable
            key={segment.key}
            onPress={() => onChange(segment.key)}
            style={[styles.segment, selected ? styles.segmentSelected : null]}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={
              badgeText ? `${segment.label}, ${segment.count} kişi` : segment.label
            }
          >
            <Text
              style={[styles.label, selected ? styles.labelSelected : null]}
              numberOfLines={1}
            >
              {segment.label}
            </Text>
            {badgeText ? (
              <View style={[styles.badge, selected ? styles.badgeSelected : null]}>
                <Text style={[styles.badgeText, selected ? styles.badgeTextSelected : null]}>
                  {badgeText}
                </Text>
              </View>
            ) : null}
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

export const SocialSegmentControl = memo(
  SocialSegmentControlComponent,
) as typeof SocialSegmentControlComponent;

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    padding: 3,
    marginHorizontal: spacing.lg,
    gap: 2,
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    minHeight: minTouchTarget - 8,
    paddingHorizontal: spacing.xxs,
    borderRadius: radius.pill,
  },
  segmentSelected: {
    backgroundColor: colors.background,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  labelSelected: {
    color: colors.textPrimary,
    fontWeight: "700",
  },
  badge: {
    minWidth: 18,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeSelected: {
    backgroundColor: colors.primary,
  },
  badgeText: {
    ...typography.label,
    fontSize: 10,
    color: colors.textSecondary,
  },
  badgeTextSelected: {
    color: colors.textInverse,
  },
});
