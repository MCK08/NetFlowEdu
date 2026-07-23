import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet } from "react-native";

interface SaveButtonProps {
  saved: boolean;
  onPress: () => void;
  size?: number;
  color?: string;
}

// Shared by feed card / question detail — mirrors LikeButton's pattern.
export function SaveButton({ saved, onPress, size = 26, color = "white" }: SaveButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.button}
      accessibilityRole="button"
      accessibilityLabel={saved ? "Kaydı kaldır" : "Kaydet"}
      accessibilityState={{ selected: saved }}
      hitSlop={8}
    >
      <Ionicons
        name={saved ? "bookmark" : "bookmark-outline"}
        size={size}
        color={saved ? "#3358D9" : color}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 44,
    minHeight: 44,
  },
});
