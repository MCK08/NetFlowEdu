import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { colors } from "@theme/colors";
import { themedStyles } from "@theme/themeRuntime";

interface CameraButtonProps {
  onPress: () => void;
  isLoading: boolean;
}

export function CameraButton({ onPress, isLoading }: CameraButtonProps) {
  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={isLoading}
      style={[styles.button, isLoading ? styles.disabled : null]}
      accessibilityRole="button"
      accessibilityLabel="Fotoğraf çek"
      accessibilityHint="Yeni bir soru fotoğrafı çeker"
    >
      {isLoading ? (
        <ActivityIndicator color={colors.textPrimary} />
      ) : (
        <Ionicons name="camera" size={30} color={colors.textPrimary} />
      )}
    </AnimatedPressable>
  );
}

const styles = themedStyles(() => ({
  button: {
    position: "absolute",
    bottom: 32,
    alignSelf: "center",
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: colors.textPrimary,
    // PLATFORM VALUE, deliberately not a token: a shadow is cast light, not
    // painted colour, so it is black in every theme. This used to be
    // colors.textPrimary, which is near-WHITE in dark mode and turned the
    // button's shadow into a glowing halo (caught on the iOS simulator).
    // Against the dark background a black shadow simply reads as no shadow,
    // and the button's own 3pt border carries the separation instead.
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  disabled: {
    opacity: 0.6,
  },
}));
