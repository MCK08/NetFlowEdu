import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet } from "react-native";

interface CameraButtonProps {
  onPress: () => void;
  isLoading: boolean;
}

export function CameraButton({ onPress, isLoading }: CameraButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={isLoading}
      style={[styles.button, isLoading ? styles.disabled : null]}
      accessibilityRole="button"
      accessibilityLabel="Fotoğraf çek"
    >
      {isLoading ? <ActivityIndicator color="black" /> : <Ionicons name="camera" size={30} color="black" />}
    </Pressable>
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
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "black",
    shadowColor: "black",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  disabled: {
    opacity: 0.6,
  },
});
