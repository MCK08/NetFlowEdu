import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Text, View } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { colors } from "@theme/colors";
import { minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";

export function QuestionHeader({ title = "Soru" }: { title?: string }) {
  return (
    <View style={styles.header}>
      <AnimatedPressable
        onPress={() => router.back()}
        style={styles.backButton}
        accessibilityRole="button"
        accessibilityLabel="Geri"
        accessibilityHint="Önceki ekrana döner"
        hitSlop={8}
      >
        <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
      </AnimatedPressable>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = themedStyles(() => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  backButton: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...typography.title,
    fontSize: 20,
    color: colors.textPrimary,
  },
}));
