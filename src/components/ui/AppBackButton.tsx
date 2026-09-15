import { Href } from "expo-router";
import { StyleProp, ViewStyle } from "react-native";

import { useBackNavigation } from "@hooks/useBackNavigation";
import { colors } from "@theme/colors";
import { iconSize } from "@theme/sizes";

import { IconButton } from "./IconButton";

interface AppBackButtonProps {
  /** Where to go when there is no history to go back to — the screen's
   *  canonical parent, never an unrelated tab. */
  fallbackHref: Href;
  /** Screens that must confirm or clean up first pass their own handler;
   *  it is expected to end in the same useBackNavigation action. */
  onPress?: () => void;
  /** "Geri" by default; a modal may prefer "Kapat". */
  accessibilityLabel?: string;
  color?: string;
  size?: keyof typeof iconSize;
  style?: StyleProp<ViewStyle>;
}

/**
 * Phase 102 — the shared back affordance for every pushed screen.
 *
 * One chevron, one 44pt target, one rule: back when there is history,
 * otherwise replace with the declared parent (see utils/backNavigation.ts).
 * Screens declare the parent; nothing here guesses it. Native iOS swipe-back
 * and the browser's own back button are untouched — this only adds the
 * visible way out, it never intercepts the platform's.
 */
export function AppBackButton({
  fallbackHref,
  onPress,
  accessibilityLabel = "Geri",
  color = colors.textPrimary,
  size = "md",
  style,
}: AppBackButtonProps) {
  const goBack = useBackNavigation(fallbackHref);
  return (
    <IconButton
      icon="chevron-back"
      onPress={onPress ?? goBack}
      accessibilityLabel={accessibilityLabel}
      color={color}
      size={size}
      style={style}
    />
  );
}
