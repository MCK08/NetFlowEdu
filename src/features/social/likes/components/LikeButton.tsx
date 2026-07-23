import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text } from "react-native";

interface LikeButtonProps {
  liked: boolean;
  likeCount: number;
  onPress: () => void;
  size?: number;
  color?: string;
  textStyle?: object;
}

// Shared by feed card / question detail / answer card — every caller
// supplies its own useLike() instance (different target), this is purely
// presentational.
export function LikeButton({
  liked,
  likeCount,
  onPress,
  size = 26,
  color = "white",
  textStyle,
}: LikeButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.button}
      accessibilityRole="button"
      accessibilityLabel={liked ? "Beğeniyi geri al" : "Beğen"}
      accessibilityState={{ selected: liked }}
      hitSlop={8}
    >
      <Ionicons
        name={liked ? "heart" : "heart-outline"}
        size={size}
        color={liked ? "#FF3B5C" : color}
      />
      <Text style={[styles.count, { color }, textStyle]}>{likeCount}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    gap: 4,
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
  },
  count: {
    fontSize: 12,
    fontWeight: "600",
  },
});
