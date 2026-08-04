import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, StyleSheet } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { colors } from "@theme/colors";

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

const styles = StyleSheet.create({
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
    shadowColor: colors.textPrimary,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  disabled: {
    opacity: 0.6,
  },
});
