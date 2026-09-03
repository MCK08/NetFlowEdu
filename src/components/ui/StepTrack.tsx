import { memo } from "react";
import { View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";

interface StepTrackProps {
  total: number;
  /** Zero-based. Segments are filled up to AND including this index. */
  activeIndex: number;
}

// Phase 74 — the segmented "where am I in this flow" bar, extracted from
// OnboardingProgress so the guided tour shows the same one rather than a
// second bar that merely looks similar.
//
// Only the TRACK moved. OnboardingProgress keeps its counter and step name,
// which are specific to the account-provisioning flow's named steps and mean
// nothing to a three-card intro; pulling those up too would have produced a
// component with two unrelated modes. This has no domain types at all, which
// is what makes it safe for both to share.
//
// Decorative on purpose: both callers already wrap it in a container that
// announces the step in words, so a screen reader that also read the bar
// would just repeat the position twice.
export const StepTrack = memo(function StepTrack({ total, activeIndex }: StepTrackProps) {
  // Phase 49 — memo() blocks prop-driven re-renders, but NOT context updates.
  useThemeSubscription();
  if (total <= 0) return null;

  return (
    <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: total }, (_, index) => (
        <View
          key={index}
          style={[styles.segment, index <= activeIndex ? styles.segmentFilled : null]}
        />
      ))}
    </View>
  );
});

const styles = themedStyles(() => ({
  track: {
    flexDirection: "row",
    gap: spacing.xxs,
  },
  segment: {
    flex: 1,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.divider,
  },
  segmentFilled: {
    backgroundColor: colors.primary,
  },
}));
