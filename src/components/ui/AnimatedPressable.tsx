import { ReactNode } from "react";
import { Pressable, PressableProps, StyleProp, ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { pressScale, spring } from "@theme/animation";

const AnimatedRNPressable = Animated.createAnimatedComponent(Pressable);

interface AnimatedPressableProps extends Omit<PressableProps, "style"> {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  // Disables the scale feedback (e.g. for a Pressable that's already
  // visually "pressed" via its own state, like a selected tab) without
  // losing everything else this wrapper gives (hit slop, disabled fade).
  scaleOnPress?: boolean;
}

// The one reusable primitive for "this touchable should feel alive" — a
// subtle scale-down on press-in, spring back on release. Built on
// Reanimated (already installed/configured, see babel.config.js's
// react-native-worklets plugin) rather than the legacy Animated API, so
// future animation primitives have one consistent engine to build on.
export function AnimatedPressable({
  children,
  style,
  scaleOnPress = true,
  disabled,
  onPressIn,
  onPressOut,
  ...pressableProps
}: AnimatedPressableProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedRNPressable
      {...pressableProps}
      disabled={disabled}
      style={[style, animatedStyle, disabled ? { opacity: 0.5 } : null]}
      onPressIn={(event) => {
        if (scaleOnPress) scale.value = withSpring(pressScale, spring.snappy);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        if (scaleOnPress) scale.value = withSpring(1, spring.snappy);
        onPressOut?.(event);
      }}
    >
      {children}
    </AnimatedRNPressable>
  );
}
