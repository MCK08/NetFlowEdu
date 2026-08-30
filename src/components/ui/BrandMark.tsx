import { Image } from "expo-image";

import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { typography } from "@theme/typography";
import { Text, View } from "react-native";

// Phase 52 — the one place the logo is rendered at runtime.
//
// Points at the SAME transparent mark the splash uses, so the launch image
// and the first React surface are literally the same artwork rather than two
// exports that can drift. It is transparent on purpose: the source logo ships
// inside its own white card, which would show as a white tile on the dark
// theme.
//
// Sizes are named rather than free-form (§49): the mark should scale by
// context, not by whatever number a call site happens to pass.
const SIZES = {
  compact: 22, // inline beside a wordmark, e.g. the feed header
  medium: 48, // authentication, bootstrap
} as const;

interface BrandMarkProps {
  size?: keyof typeof SIZES;
  // Phase 55 — for callers that render the lockup over a surface which is
  // dark in BOTH themes (the immersive student feed's floating chrome). The
  // wordmark normally uses `textPrimary`, which is near-black in light mode
  // and disappeared against that always-dark page. The mark's own artwork is
  // legible on dark either way, so only the wordmark needs pinning.
  onDark?: boolean;
}

export function BrandMark({ size = "medium" }: BrandMarkProps) {
  const px = SIZES[size];
  return (
    <Image
      source={require("../../../assets/images/splash-icon.png")}
      style={{ width: px, height: px }}
      contentFit="contain"
      // Decorative: every caller pairs it with the "NetFlow Edu" wordmark, so
      // announcing it again would just make screen readers say the product
      // name twice.
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}

// Mark + wordmark as one unit, for the surfaces that introduce the product
// (authentication, bootstrap) rather than the ones that merely carry it.
export function BrandLockup({ size = "medium", onDark = false }: BrandMarkProps) {
  return (
    <View style={styles.lockup} accessibilityRole="header" accessibilityLabel="NetFlow Edu">
      <BrandMark size={size} />
      <Text style={onDark ? styles.wordmarkOnDark : styles.wordmark}>NetFlow Edu</Text>
    </View>
  );
}

const styles = themedStyles(() => ({
  lockup: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  wordmark: {
    ...typography.title,
    color: colors.textPrimary,
  },
  wordmarkOnDark: {
    ...typography.title,
    // Constant, deliberately not a token — see `onDark` above.
    color: "#FFFFFF",
  },
}));
