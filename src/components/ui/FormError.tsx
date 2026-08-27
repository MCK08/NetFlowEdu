import { Text, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.container} accessibilityLiveRegion="assertive" accessibilityRole="alert">
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = themedStyles(() => ({
  container: {
    backgroundColor: colors.dangerMuted,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  text: {
    color: colors.danger,
    fontSize: 14,
  },
}));
