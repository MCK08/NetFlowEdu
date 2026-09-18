import { View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";

interface RateBarProps {
  /** 0-100. The caller renders nothing at all when the rate is unknown. */
  percent: number;
}

// Phase 107 — a quiet bar beside a real percentage. Purely decorative: the
// number is always written out next to it, so assistive technology skips the
// bar and reads the number instead.
export function RateBar({ percent }: RateBarProps) {
  useThemeSubscription();
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.fill, { width: `${clamped}%` }]} />
    </View>
  );
}

const styles = themedStyles(() => ({
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
}));
