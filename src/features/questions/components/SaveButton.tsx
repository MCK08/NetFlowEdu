import { Ionicons } from "@expo/vector-icons";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { colors } from "@theme/colors";
import { minTouchTarget } from "@theme/sizes";
import { themedStyles } from "@theme/themeRuntime";

interface SaveButtonProps {
  saved: boolean;
  onPress: () => void;
  size?: number;
  color?: string;
}

// Shared by feed card / question detail — mirrors LikeButton's pattern.
export function SaveButton({ saved, onPress, size = 26, color = colors.textInverse }: SaveButtonProps) {
  return (
    <AnimatedPressable
      onPress={onPress}
      style={styles.button}
      accessibilityRole="button"
      accessibilityLabel={saved ? "Kaydı kaldır" : "Kaydet"}
      accessibilityHint={saved ? "Bu soruyu kayıtlılardan çıkarır" : "Bu soruyu kaydeder"}
      accessibilityState={{ selected: saved }}
      hitSlop={8}
    >
      <Ionicons
        name={saved ? "bookmark" : "bookmark-outline"}
        size={size}
        color={saved ? colors.primary : color}
      />
    </AnimatedPressable>
  );
}

const styles = themedStyles(() => ({
  button: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
  },
}));
